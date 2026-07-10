import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { getEvalResults } from '../lib/api';

export default function EvalDashboard({ data }) {
  if (!data) {
    return (
      <div className="p-8 md:p-12">
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 max-w-2xl mx-auto text-center">
          <h2 className="text-xl text-slate-900 font-bold tracking-tight mb-4">Results Not Found</h2>
          <p className="text-slate-600 mb-4">
            Run the following command to generate the evaluation results:
          </p>
          <code className="bg-slate-50 text-blue-600 p-3 rounded-xl block text-left font-mono border border-slate-200">
            python -m backend.model.evaluate
          </code>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = Object.entries(data.per_continent || {}).map(([continent, stats]) => ({
    name: continent,
    top1: stats.top1,
    top3: stats.top3,
    samples: stats.samples
  }));

  // Sort table data by Top-1 descending
  const tableData = [...chartData].sort((a, b) => b.top1 - a.top1);

  const baseline = data.baseline_comparison?.clip_zeroshot_published || 31.0;
  const top1Diff = (data.top1 - baseline).toFixed(1);
  const isPositive = data.top1 >= baseline;

  const getColor = (val) => {
    if (val > 40) return 'text-blue-600';
    if (val >= 30) return 'text-blue-500';
    return 'text-slate-500';
  };

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      
      {/* SECTION 1 - Hero stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Top-1 Accuracy</div>
          <div className="text-4xl font-mono font-bold text-slate-900">{data.top1}%</div>
        </div>
        
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Top-3 Accuracy</div>
          <div className="text-4xl font-mono font-bold text-slate-900">{data.top3}%</div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">vs Baseline</div>
          <div className={`text-4xl font-mono font-bold ${isPositive ? 'text-blue-600' : 'text-orange-500'}`}>
            {isPositive ? '+' : ''}{top1Diff}%
          </div>
          <div className="text-slate-400 text-xs mt-2">CLIP zero-shot: {baseline}%</div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Samples</div>
          <div className="text-4xl font-mono font-bold text-slate-900">{data.samples}</div>
          <div className="text-slate-400 text-xs mt-2">random seed=42</div>
        </div>
      </div>

      {/* SECTION 2 - Model info bar */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 text-center">
        <span className="text-slate-700 font-medium">
          Model: {data.method} <span className="text-slate-300 mx-2">|</span> Dataset: Country211 (44K images, 211 classes)
        </span>
      </div>

      {/* SECTION 3 - Per continent chart */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <h3 className="font-sans text-xl font-bold tracking-tight text-slate-900 mb-6 text-center">Accuracy by Continent</h3>
        <div className="w-full h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#64748b'}} />
              <YAxis domain={[0, 100]} stroke="#64748b" tick={{fill: '#64748b'}} unit="%" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: '#0f172a', fontFamily: "'Space Grotesk', monospace" }}
                labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <ReferenceLine y={baseline} stroke="#f97316" strokeDasharray="3 3" label={{ position: 'top', value: 'CLIP baseline', fill: '#f97316', fontSize: 12 }} />
              <Bar dataKey="top1" name="Top-1 Accuracy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="top3" name="Top-3 Accuracy" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 4 - Per continent data table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs tracking-wider">
                <th className="px-6 py-4 font-semibold">Continent</th>
                <th className="px-6 py-4 font-semibold">Top-1</th>
                <th className="px-6 py-4 font-semibold">Top-3</th>
                <th className="px-6 py-4 font-semibold">Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tableData.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">{row.name}</td>
                  <td className={`px-6 py-4 font-mono font-bold ${getColor(row.top1)}`}>
                    {row.top1}%
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-600">{row.top3}%</td>
                  <td className="px-6 py-4 font-mono text-slate-400">{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
