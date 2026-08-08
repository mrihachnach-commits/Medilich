import React, { useState, useEffect } from 'react';
import { SystemSchemaDoc } from '../types';
import { Cpu, Code2, Server, Terminal, Copy, Check, FileText, Workflow, Zap, Database } from 'lucide-react';

export const SystemArchitectureInspector: React.FC = () => {
  const [schemaDoc, setSchemaDoc] = useState<SystemSchemaDoc | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'architecture' | 'system_prompt' | 'json_schema' | 'backend_code'>('architecture');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/schema')
      .then((res) => res.json())
      .then((data) => setSchemaDoc(data))
      .catch((err) => console.error('Failed to load schema doc', err));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!schemaDoc) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <span>Đang tải thông tin kiến trúc & Gemini Schema...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-100 text-lg flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            Kiến Trúc Hệ Thống & Gemini Function Calling Schema Inspector
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Toàn bộ định nghĩa System Instructions, JSON Schema Tool Use và Quy trình xử lý dữ liệu AI cho Bác sĩ.
          </p>
        </div>

        {/* Subtab Navigation */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('architecture')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'architecture' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Quy Trình Architecture
          </button>
          <button
            onClick={() => setActiveSubTab('system_prompt')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'system_prompt' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. System Instruction
          </button>
          <button
            onClick={() => setActiveSubTab('json_schema')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'json_schema' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Function Calling Schema
          </button>
          <button
            onClick={() => setActiveSubTab('backend_code')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'backend_code' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            4. Backend Code API
          </button>
        </div>
      </div>

      {/* Subtab 1: Architecture Diagram Flow */}
      {activeSubTab === 'architecture' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {schemaDoc.architectureSteps.map((step) => (
              <div key={step.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 relative">
                <div className="w-8 h-8 rounded-xl bg-indigo-950 border border-indigo-800 text-indigo-300 font-extrabold flex items-center justify-center text-sm">
                  {step.id}
                </div>
                <h3 className="font-bold text-slate-100 text-sm leading-snug">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono text-cyan-400 font-medium">
                  {step.tech}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Sequence Flow Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <Workflow className="w-5 h-5 text-indigo-400" />
              Sơ Đồ Luồng Dữ Liệu Chi Tiết (Data Processing Flow)
            </h3>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto space-y-2">
              <div className="text-cyan-400 font-bold">[ Bác sĩ Nói/Gửi tin ] 💬 "Thêm lịch học MRI tối T3 từ 19h30 đến 21h30"</div>
              <div className="pl-4 text-slate-400">⬇ (1) Web Speech API / REST Client GUI</div>
              <div className="text-indigo-400 font-bold">[ Express Backend API ] 🚀 POST /api/chat (chèn Prompt Context)</div>
              <div className="pl-4 text-slate-400">⬇ (2) Chuyển dữ liệu + System Instructions</div>
              <div className="text-purple-400 font-bold">[ Gemini 3.6 Flash Engine ] 🧠 Trích xuất Function Call: tao_lich_hen</div>
              <div className="pl-8 text-amber-300 font-semibold">&#123; title: "Học MRI", startTime: "19:30", priority: "P2", bufferMinutes: 45 &#125;</div>
              <div className="pl-4 text-slate-400">⬇ (3) Thực thi Tool & Ma trận Eisenhower (P1-P4) + Cảnh báo Buffer</div>
              <div className="text-emerald-400 font-bold">[ Bi-directional Sync ] 🔄 Tự động tạo Event & Cập nhật Google & Outlook Calendar</div>
              <div className="pl-4 text-slate-400">⬇ (4) Trả về Kết quả Phản hồi cho Bác sĩ</div>
              <div className="text-slate-100 font-bold">✅ "Em đã tạo lịch hẹn thành công & bảo vệ 45p đệm di chuyển!"</div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: System Instruction Prompt */}
      {activeSubTab === 'system_prompt' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              System Instruction Dành Cho Gemini AI Assistant
            </h3>
            <button
              onClick={() => copyToClipboard(schemaDoc.systemInstruction)}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã Sao Chép' : 'Sao Chép System Prompt'}</span>
            </button>
          </div>

          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[500px]">
            {schemaDoc.systemInstruction}
          </pre>
        </div>
      )}

      {/* Subtab 3: Function Calling JSON Schema */}
      {activeSubTab === 'json_schema' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <Code2 className="w-5 h-5 text-indigo-400" />
              Gemini Tool Use (Function Calling JSON Schemas)
            </h3>
            <button
              onClick={() => copyToClipboard(JSON.stringify(schemaDoc.functionDeclarations, null, 2))}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã Sao Chép' : 'Sao Chép JSON Schema'}</span>
            </button>
          </div>

          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-indigo-300 font-mono overflow-x-auto max-h-[500px]">
            {JSON.stringify(schemaDoc.functionDeclarations, null, 2)}
          </pre>
        </div>
      )}

      {/* Subtab 4: Backend API Express Integration Code */}
      {activeSubTab === 'backend_code' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              Mã Nguồn Backend Express + Gemini Function Calling API
            </h3>
          </div>

          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-emerald-300 font-mono overflow-x-auto max-h-[500px]">
{`import { GoogleGenAI } from '@google/genai';
import express from 'express';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: message,
    config: {
      systemInstruction: "Bạn là Trợ lý AI Bác sĩ Chẩn đoán Hình ảnh...",
      tools: [{ functionDeclarations: [taoLichHenDeclaration, capNhatUuTienDeclaration, dongBoCalendarDeclaration] }]
    }
  });

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    // Tự động gọi hàm & đồng bộ Google Calendar API
  }

  res.json({ reply: response.text });
});`}
          </pre>
        </div>
      )}
    </div>
  );
};
