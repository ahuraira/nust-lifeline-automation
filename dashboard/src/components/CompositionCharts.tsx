import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CompositionResponse } from '../types/api';

interface CompositionChartsProps {
    data: CompositionResponse;
    isLoading?: boolean;
}

const COLORS = {
    zakat: 'var(--color-chart-1)', // emerald
    general: 'var(--color-chart-2)', // indigo
    duration: [
        'var(--color-chart-3)', // amber
        'var(--color-chart-4)', // blue
        'var(--color-chart-5)', // purple
        'var(--color-chart-6)', // pink
    ],
};

interface DonutProps {
    title: string;
    data: { name: string; value: number; percent: number }[];
    colors: string[];
}

function Donut({ title, data, colors }: DonutProps) {
    return (
        <div className="flex flex-col items-center">
            <h4 className="text-xs text-[var(--color-text-secondary)] mb-2">{title}</h4>
            <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={50}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {data.map((_, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={colors[index % colors.length]}
                                    stroke="transparent"
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--glass-bg)',
                                backdropFilter: 'var(--glass-blur)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '12px',
                                boxShadow: 'var(--glass-shadow)',
                                padding: '12px',
                                color: 'var(--color-text-primary)'
                            }}
                            itemStyle={{ color: 'var(--color-text-primary)' }}
                            formatter={(value, name) => {
                                const numVal = Number(value) || 0;
                                return [
                                    `${numVal.toLocaleString()} (${data.find(d => d.name === name)?.percent || 0}%)`,
                                    String(name)
                                ];
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="mt-2 space-y-1">
                {data.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: colors[index % colors.length] }}
                        />
                        <span className="text-xs text-[var(--color-text-primary)] font-medium">
                            {item.name}
                        </span>
                        <span className="text-xs text-[var(--color-text-secondary)]">{item.percent}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CompositionCharts({ data, isLoading }: CompositionChartsProps) {
    if (isLoading) {
        return (
            <div className="glass-card rounded-xl p-6">
                <div className="grid grid-cols-2 gap-6">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex flex-col items-center">
                            <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-700/50 animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const zakatData = [
        { name: 'Zakat', value: data.zakat.amount, percent: data.zakat.percent },
        { name: 'General', value: data.general.amount, percent: data.general.percent },
    ];

    const affiliationData = (data.affiliation || []).map(d => ({
        name: d.type,
        value: d.amount,
        percent: d.percent,
    }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="glass-card rounded-xl p-8"
        >
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-4 text-center">
                Fund Composition
            </h3>

            <div className="grid grid-cols-2 gap-6">
                <Donut
                    title="Zakat vs General"
                    data={zakatData}
                    colors={[COLORS.zakat, COLORS.general]}
                />
                <Donut
                    title="Donor Affiliation"
                    data={affiliationData}
                    colors={COLORS.duration} // Using same color palette for now
                />
            </div>
        </motion.div>
    );
}
