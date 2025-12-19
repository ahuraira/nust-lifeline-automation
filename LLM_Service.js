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

function analyzeDonorEmail(emailContent, attachmentNames) {
  const FUNC_NAME = 'analyzeDonorEmail';
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return null;

    // Use Gemini Model from Config
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const prompt = `
      You are an AI assistant for a Hostel Fund analyzing a donor email.
      
      IMPORTANT: The email content is structured in sections:
      1. "CURRENT EMAIL (Analyze This)" - This is the NEW message from the donor. BASE YOUR DECISION ON THIS ONLY.
      2. "THREAD HISTORY" (if present) - These are PREVIOUS messages for context. IGNORE questions or concerns in this section.
      
      Your Task:
      1. Categorize ONLY the CURRENT EMAIL:
         - "RECEIPT_SUBMISSION": The donor is sending proof of payment (e.g., "PFA", "Attached", "Please find attached", or similar short messages with attachments).
         - "QUESTION": The CURRENT EMAIL contains a new question or concern that needs a reply.
         - "IRRELEVANT": Spam or unrelated content.
      
      2. Identify the Receipt from ATTACHMENTS:
         - Pick the filename most likely to be a receipt (e.g., "receipt.pdf", "screenshot.jpg").
         - Ignore icons, signatures, or irrelevant files (e.g., "image001.png", "facebook.png").
         - If no valid receipt, set 'best_attachment_name' to null.

      3. Draft a Reply (Only if CURRENT EMAIL is a QUESTION):
         - If category is "QUESTION", draft a polite response.
         - If category is "RECEIPT_SUBMISSION", leave 'suggested_reply' empty.

      === EMAIL CONTENT ===
      ${emailContent}
      
      === ATTACHMENTS IN CURRENT EMAIL ===
      ${JSON.stringify(attachmentNames)}
    `;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", enum: ["RECEIPT_SUBMISSION", "QUESTION", "IRRELEVANT"] },
            is_receipt_present: { type: "BOOLEAN" },
            best_attachment_name: { type: "STRING" },
            summary: { type: "STRING" },
            suggested_reply: { type: "STRING" }
          },
          required: ["category", "is_receipt_present", "summary"]
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