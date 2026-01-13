/**
 * Analyzes an email body using the Gemini 3 Flash API with forced JSON output.
 * @param {string} emailBody The plain text body of the email from the university.
 * @returns {Object|null} A structured object { summary: "...", newStatus: "..." } or null on failure.
 */
function analyzeEmailWithGemini(emailBody) {
  const FUNC_NAME = 'analyzeEmailWithGemini';
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      writeLog('ERROR', FUNC_NAME, 'Gemini API Key is not set in Script Properties.');
      return null;
    }

    // Use Gemini Model from Config
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // Updated prompt that explains the structured email format
    const prompt = `
      You are an AI assistant analyzing university email communications about payment verifications.
      
      The input below contains two sections:
      1. "CURRENT EMAIL" - This is the NEW email that just arrived. Analyze THIS email to determine the status.
      2. "THREAD HISTORY" (optional) - These are previous emails in the conversation for context only.
      
      Your Task:
      - Focus on the CURRENT EMAIL content to determine if it is:
        a) A final CONFIRMATION that payment has been received/verified
        b) A QUERY or problem that needs resolution
        c) A simple ACKNOWLEDGEMENT (e.g., "noted", "received", "forwarding")
      - Use the Thread History only for context about what was originally requested.
      
      Provide a brief, one-sentence summary of the CURRENT email's key message.

      Email Content:
      ---
      ${emailBody}
      ---
    `;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      // --- ROBUSTNESS UPGRADE: Enforce JSON Mode ---
      generationConfig: {
        responseMimeType: "application/json",
        // Define the schema of the JSON you want back.
        responseSchema: {
          type: "OBJECT",
          properties: {
            summary: { type: "STRING" },
            newStatus: {
              type: "STRING",
              description: "Classify as 'Confirmed' ONLY if payment is explicitly verified. Use 'Query' for any issues, rejections, or questions. Use 'Acknowledged' for generic receipts.",
              enum: ["Confirmed", "Query", "Acknowledged"]
            }
          },
          required: ["summary", "newStatus"]
        }
      }
      // -------------------------------------------
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode === 200) {
      const jsonResponse = JSON.parse(responseBody);
      const rawText = jsonResponse.candidates[0].content.parts[0].text;
      return JSON.parse(cleanJsonOutput(rawText));
    } else {
      writeLog('ERROR', FUNC_NAME, `Gemini API returned an error. Code: ${responseCode}. Body: ${responseBody}`);
      return null;
    }

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `A critical error occurred while calling the Gemini API: ${e.toString()}`);
    return null;
  }
}

/**
 * A test harness for the Gemini analysis function.
 * Use this to manually test the AI's response to different types of email content.
 */
function test_analyzeEmail() {
  // --- Create different scenarios to test ---

  const testEmail_Confirmation = `
    Dear Team,
    
    This is to confirm that the payment has been received and credited to the student's account. 
    
    Thanks,
    Finance Office
  `;

  const testEmail_Query = `
    Hi,
    
    We have received your request but there seems to be an issue with the reference number provided. Can you please advise?
    
    Regards,
    Hostel Accounts
  `;

  const testEmail_Acknowledgement = `
    Noted. Forwarding to the relevant department.
  `;

  // --- CHOOSE WHICH SCENARIO TO RUN ---
  const emailToTest = testEmail_Query;
  // Change the variable above to testEmail_Query or testEmail_Acknowledgement to test other cases.

  Logger.log('--- STARTING GEMINI ANALYSIS TEST ---');
  Logger.log('Input Text:\n' + emailToTest);

  const result = analyzeEmailWithGemini(emailToTest);

  Logger.log('--- GEMINI API RESPONSE ---');
  if (result) {
    Logger.log('Status: SUCCESS');
    Logger.log('Parsed JSON Output:');
    Logger.log(JSON.stringify(result, null, 2)); // Pretty-print the JSON for easy reading
    Logger.log(`Summary: ${result.summary}`);
    Logger.log(`Recommended Status: ${result.newStatus}`);
  } else {
    Logger.log('Status: FAILED');
    Logger.log('The function returned null. Check the logs for a detailed error from the API.');
  }
  Logger.log('--- TEST COMPLETE ---');
}

/**
 * Analyzes a donor email (and its attachments) to extract intent and transaction details.
 * Uses Gemini's Multimodal capabilities to "view" receipts.
 * 
 * @param {string} emailBody - The plain text body of the email.
 * @param {GoogleAppsScript.Base.Blob[]} attachments - Array of file blobs (images/PDFs).
 * @param {Date} pledgeDate - The date the pledge was originally made (Lower Bound).
 * @param {Date} emailDate - The date the email was received (Upper Bound).
 * @param {number} pledgedAmount - The expected amount (for context).
 * @returns {Object|null} Structured result including category, transfer date, and summary.
 */
function analyzeDonorEmail(emailBody, attachments, pledgeDate, emailDate, pledgedAmount) {
  const FUNC_NAME = 'analyzeDonorEmail';

  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      writeLog('ERROR', FUNC_NAME, 'Gemini API Key is not set.');
      return null;
    }

    // Use Gemini Model from Config
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // 1. Prepare Metadata Strings
    const strEmailDate = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const strPledgeDate = Utilities.formatDate(pledgeDate, Session.getScriptTimeZone(), "yyyy-MM-dd");

    // Safety check for map
    const attachmentNames = attachments ? attachments.map(a => a.getName()).join(", ") : "None";

    // 2. Prepare Multimedia Payload (Images/PDFs)
    // This utility ensures base64 encoding matches Gemini's requirements
    const fileParts = prepareAttachmentsForGemini(attachments);

    // 3. Construct the Robust Prompt
    const textPrompt = `
      You are an AI Forensic Accountant for a Student Hostel Fund.
      
      === CONTEXT ===
      - PLEDGE AMOUNT: ${pledgedAmount} (Expected)
      - Pledge Date: ${strPledgeDate}
      - Email Date: ${strEmailDate}
      - Attached Files: [${attachmentNames}]
      
      === YOUR TASK ===
      1. Analyze the "CURRENT EMAIL" text to find the "DECLARED AMOUNT" (what the donor SAYS they sent).
      2. VISUALLY ANALYZE the attached files (images/PDFs) to find PROOF OF PAYMENT.
      3. Extract transaction details for *each* valid receipt found.
      
      === RULES FOR FORENSIC VERIFICATION ===
      - **Amount Extraction**: Look for the final numeric amount. Ignore currency symbols if possible, but note if it's NOT PKR.
      - **Matching**: Compare extracted amount with PLEDGE AMOUNT. 
      - **Dates**: Transfer date must be somewhat close to Pledge/Email Date.
      - **Confidence**: 
         - Name: Check if Sender Name (from Image) matches Donor Name (Unknown/Context).
         - Account: Check if destination account matches 'NUST' or 'Hostel Fund'.
      - **Multiple Receipts**: If multiple images show different transactions, list them all. If they are duplicates, only list one.
      
      === CATEGORIZATION ===
      - "RECEIPT_SUBMISSION": Found at least one valid receipt.
      - "QUESTION": User is asking a question.
      - "IRRELEVANT": Spam/Junk.

      === INPUT EMAIL TEXT ===
      ${emailBody.replace(/"/g, '\\"')}
    `;

    // 4. Assemble Final Payload (Text + Files)
    const parts = [{ text: textPrompt }, ...fileParts];

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", enum: ["RECEIPT_SUBMISSION", "QUESTION", "IRRELEVANT"] },
            summary: { type: "STRING", description: "Brief summary of contents." },

            // --- ARRAY OF VERIFIED RECEIPTS ---
            valid_receipts: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  filename: { type: "STRING" },
                  amount: { type: "NUMBER", description: "Numeric amount extracted from image." },
                  amount_declared: { type: "NUMBER", description: "Amount donor CLAIMS to have sent in text." },
                  date: { type: "STRING", description: "YYYY-MM-DD" },
                  sender_name: { type: "STRING", description: "Name on receipt" },
                  confidence_score: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
                  confidence_details: {
                    type: "OBJECT",
                    properties: {
                      amount_match: { type: "STRING", enum: ["EXACT", "PARTIAL", "MISMATCH", "UNKNOWN"] },
                      name_match: { type: "STRING", enum: ["LIKELY", "UNLIKELY", "UNKNOWN"] },
                      destination_match: { type: "STRING", enum: ["CONFIRMED", "UNKNOWN"] }
                    }
                  },
                  notes: { type: "STRING", description: "e.g. 'Partial match', 'Different Currency'" }
                }
              }
            },

            suggested_reply: { type: "STRING", description: "Draft a reply if QUESTION." },
            reasoning: { type: "STRING", description: "Why did you choose this outcome?" }
          },
          required: ["category", "summary", "valid_receipts"]
        }
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    // 5. Call API
    const response = UrlFetchApp.fetch(apiUrl, options);

    if (response.getResponseCode() === 200) {
      const jsonResponse = JSON.parse(response.getContentText());
      // Handle potential safety blocks or empty candidates
      if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
        writeLog('WARN', FUNC_NAME, 'Gemini returned no candidates (Safety Block?).');
        return null;
      }
      const rawText = jsonResponse.candidates[0].content.parts[0].text;
      return JSON.parse(cleanJsonOutput(rawText));
    } else {
      writeLog('ERROR', FUNC_NAME, `Gemini API Error: ${response.getContentText()}`);
      return null;
    }

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Critical Error: ${e.toString()}`);
    return null;
  }
}

/**
 * INTELLIGENT WATCHDOG: Analyzes a Hostel Reply to match it with Open Allocations.
 * @param {string} emailText The full email thread content.
 * @param {Array<Object>} openAllocations List of { allocId, student, cms, amount } we are waiting for.
 * @returns {Object} JSON { confirmedAllocIds: [], status: "CONFIRMED_ALL"|"PARTIAL"|"AMBIGUOUS" }
 */
function analyzeHostelReply(emailText, openAllocations) {
  const FUNC_NAME = 'analyzeHostelReply';
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return null;

    // Use Gemini Model from Config
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const prompt = `
      You are a Forensic Accountant. Match the email reply to the pending allocations.

      Open Allocations: ${JSON.stringify(openAllocations)}
      Email Body: "${emailText.replace(/"/g, '\\"')}"

      Your Goal: Return a list of Allocation IDs that are POSITIVELY confirmed.
      
      Rules:
      1. If the email explicitly cites a Name, CMS ID, or Amount from the Open Allocations list, match it.
      2. If the email implies "All" (e.g. "Confirmed", "Received", "Done") and does not mention specific exclusions, match ALL pending allocations.
      3. If there are multiple allocations but the email is vague about WHICH one (and doesn't imply all), return "AMBIGUOUS".
      4. If there is only 1 allocation and the email is vague ("Confirmed"), match it.
      5. If the email contains a "Allocation Ref: ALLOC-xxxx", that is a definitive match.

      --- OUTPUT SCHEMA (JSON ONLY) ---
      {
        "status": "CONFIRMED_ALL" | "PARTIAL" | "AMBIGUOUS" | "QUERY",
        "confirmedAllocIds": ["ID1", "ID2"] (List of Allocation IDs that are POSITIVELY confirmed),
        "reasoning": "Brief explanation of why these were selected"
      }
    `;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            status: { type: "STRING", enum: ["CONFIRMED_ALL", "PARTIAL", "AMBIGUOUS", "QUERY"] },
            confirmedAllocIds: { type: "ARRAY", items: { type: "STRING" } },
            reasoning: { type: "STRING" }
          },
          required: ["status", "confirmedAllocIds", "reasoning"]
        }
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    if (response.getResponseCode() === 200) {
      const jsonResponse = JSON.parse(response.getContentText());
      const rawText = jsonResponse.candidates[0].content.parts[0].text;
      return JSON.parse(cleanJsonOutput(rawText));
    } else {
      writeLog('ERROR', FUNC_NAME, `Gemini API Error: ${response.getContentText()}`);
      return null;
    }

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Critical Error: ${e.toString()}`);
    return null;
  }
}

/**
 * Helper to strip markdown code blocks from AI response.
 * @param {string} text The raw text from AI.
 * @return {string} Pure JSON string.
 */
function cleanJsonOutput(text) {
  return text.replace(/```json\s*|\s*```/g, '').trim();
}