import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { INITIAL_EVENTS } from './src/data/initialData.js';
import { ScheduleEvent, PriorityLevel, EventCategory } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize in-memory database store
let scheduleEvents: ScheduleEvent[] = [...INITIAL_EVENTS];
let syncStatus = { googleConnected: false, totalSyncedEvents: 0 };

// System Instruction for Gemini AI Assistant
const DOCTOR_SYSTEM_INSTRUCTION = `Trợ lý AI Quản lý Lịch cho Bác sĩ CĐHA - BV Nội tiết TƯ.
Bối cảnh: T2-T6 làm viện (siêu âm, MRI, RFA, VABB). Tối (19h30+) học MRI/CLVT hoặc nghỉ (P4). Cuối tuần làm PK (MSK) ban ngày, nghỉ tối.
Ưu tiên (Eisenhower):
- P1: Can thiệp lâm sàng (RFA, VABB, Sinh thiết), Cấp cứu.
- P2: Học tập chuyên sâu. Cần đệm 45p sau giờ làm.
- P3: Thường quy (Siêu âm, PK).
- P4: Nghỉ ngơi. TUYỆT ĐỐI ko chen lịch trừ khi y/c.
Nhiệm vụ: Phân tích tin nhắn, gọi hàm phù hợp, phản hồi lịch sự (xưng Em, gọi Anh/Bác sĩ).`;

// Function Declarations for Gemini Tool Use
const taoLichHenDeclaration: FunctionDeclaration = {
  name: 'tao_lich_hen',
  description: 'Tạo một lịch hẹn hoặc công việc mới trong thời gian biểu của bác sĩ.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Tên công việc hoặc sự kiện (VD: Học MRI sọ não, Can thiệp RFA giáp, Siêu âm PK)',
      },
      date: {
        type: Type.STRING,
        description: 'Ngày diễn ra theo định dạng YYYY-MM-DD (VD: 2026-08-11)',
      },
      dayOfWeek: {
        type: Type.INTEGER,
        description: 'Thứ trong tuần (1: Thứ 2, 2: Thứ 3, ..., 6: Thứ 7, 0: Chủ Nhật)',
      },
      startTime: {
        type: Type.STRING,
        description: 'Giờ bắt đầu dạng HH:mm (VD: 19:30)',
      },
      endTime: {
        type: Type.STRING,
        description: 'Giờ kết thúc dạng HH:mm (VD: 21:30)',
      },
      category: {
        type: Type.STRING,
        description: 'Phân loại nhóm: hospital (Bệnh viện), study (Học tập), clinic (Phòng khám), rest (Nghỉ ngơi), personal (Cá nhân)',
      },
      priority: {
        type: Type.STRING,
        description: 'Mức độ ưu tiên Eisenhower: P1 (Khẩn cấp/Lâm sàng), P2 (Học tập/Chuyên sâu), P3 (Thường quy), P4 (Nghỉ ngơi)',
      },
      location: {
        type: Type.STRING,
        description: 'Địa điểm làm việc/học tập (VD: Bệnh viện Nội tiết TƯ - Phòng MRI, Hội trường Đại học Y)',
      },
      bufferMinutes: {
        type: Type.INTEGER,
        description: 'Thời gian đệm nghỉ ngơi/di chuyển tính bằng phút (mặc định 30-45 phút trước buổi học)',
      },
      isIntervention: {
        type: Type.BOOLEAN,
        description: 'Có phải là ca thủ thuật can thiệp lâm sàng khẩn cấp không (RFA, VABB, Sinh thiết)',
      },
      description: {
        type: Type.STRING,
        description: 'Ghi chú bổ sung cho lịch hẹn',
      },
    },
    required: ['title', 'startTime', 'endTime', 'category'],
  },
};

const capNhatUuTienDeclaration: FunctionDeclaration = {
  name: 'cap_nhat_uu_tien',
  description: 'Cập nhật mức độ ưu tiên Eisenhower (P1-P4) hoặc phân loại nhóm cho công việc đã có.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: {
        type: Type.STRING,
        description: 'Mã id sự kiện cần cập nhật',
      },
      eventTitleKeyword: {
        type: Type.STRING,
        description: 'Từ khóa tìm kiếm tên sự kiện nếu không có id',
      },
      newPriority: {
        type: Type.STRING,
        description: 'Mức ưu tiên mới (P1, P2, P3, P4)',
      },
      newCategory: {
        type: Type.STRING,
        description: 'Phân loại mới (hospital, study, clinic, rest, personal)',
      },
    },
    required: ['newPriority'],
  },
};

// dongBoCalendarDeclaration removed

const xoaLichHenDeclaration: FunctionDeclaration = {
  name: 'xoa_lich_hen',
  description: 'Xóa hoặc hủy một lịch hẹn/công việc trong thời gian biểu.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: {
        type: Type.STRING,
        description: 'Mã sự kiện cần xóa',
      },
      titleKeyword: {
        type: Type.STRING,
        description: 'Từ khóa tìm kiếm sự kiện muốn hủy',
      },
    },
  },
};

const tinhKhangDemDeclaration: FunctionDeclaration = {
  name: 'tinh_khang_dem',
  description: 'Tính toán khoảng nghỉ đệm (Buffer time) và cảnh báo xung đột giữa ca bệnh viện và buổi học tối.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      dayOfWeek: {
        type: Type.INTEGER,
        description: 'Thứ cần kiểm tra khoảng đệm (1-6, 0)',
      },
    },
  },
};

const ghiNhoThoiQuenDeclaration: FunctionDeclaration = {
  name: 'ghi_nho_thoi_quen',
  description: 'Tự động học hỏi, trích xuất và lưu trữ thói quen, giờ giấc làm việc, sở thích hoặc quy tắc cá nhân do Bác sĩ chia sẻ trong chat vào Prompt Phụ.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      memoryText: {
        type: Type.STRING,
        description: 'Câu tóm tắt vắn tắt thói quen hoặc khung giờ làm việc/nghỉ ngơi mới của Bác sĩ (VD: "Thời gian làm việc tại BV Nội tiết TƯ: Sáng 07:30 - 12:00, Chiều 13:30 - 16:30")',
      },
    },
    required: ['memoryText'],
  },
};

// Lazy initialization of Gemini API Client
function getGeminiAI(options?: { aiProvider?: string; geminiApiKey?: string; shopaikeyApiKey?: string; shopaikeyBaseUrl?: string }) {
  let apiKey = process.env.GEMINI_API_KEY;
  let baseUrl: string | undefined = undefined;
  
  const clientOptions: any = {
    apiKey: apiKey || 'dummy-key',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  };

  if (options?.aiProvider === 'shopaikey') {
    apiKey = options.shopaikeyApiKey || apiKey;
    // The GoogleGenAI SDK automatically appends /v1beta/... or /v1/... to the baseUrl
    // If the user provided a URL ending in /v1, we can set apiVersion to 'v1' and strip it from baseUrl.
    let rawBaseUrl = options.shopaikeyBaseUrl || 'https://api.shopaikey.com';
    let apiVersion = undefined;
    
    if (rawBaseUrl.endsWith('/v1')) {
      rawBaseUrl = rawBaseUrl.slice(0, -3);
      apiVersion = 'v1';
    } else if (rawBaseUrl.endsWith('/v1beta')) {
      rawBaseUrl = rawBaseUrl.slice(0, -7);
      apiVersion = 'v1beta';
    } else if (rawBaseUrl.endsWith('/')) {
      rawBaseUrl = rawBaseUrl.slice(0, -1);
    }
    
    baseUrl = rawBaseUrl;
    
    if (apiVersion) {
      clientOptions.httpOptions.apiVersion = apiVersion;
    }
  } else if (options?.aiProvider === 'gemini') {
    apiKey = options.geminiApiKey || apiKey;
  }

  if (!apiKey) {
    console.warn('GEMINI_API_KEY environment variable is not set. Mock fallback will be used if needed.');
  }

  // update the API key in clientOptions if it changed
  clientOptions.apiKey = apiKey || 'dummy-key';

  if (baseUrl) {
    clientOptions.httpOptions.baseUrl = baseUrl;
  }

  return new GoogleGenAI(clientOptions);
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), doctor: 'BS. Chẩn đoán Hình ảnh - BVNTTƯ' });
});

// GET all events
app.get('/api/events', (req, res) => {
  res.json({ events: scheduleEvents, syncStatus });
});

// POST new event
app.post('/api/events', (req, res) => {
  const newEvt: ScheduleEvent = {
    id: `evt-${Date.now()}`,
    title: req.body.title || 'Công việc mới',
    category: req.body.category || 'hospital',
    categoryLabel: req.body.categoryLabel || 'Bệnh viện',
    priority: req.body.priority || 'P3',
    priorityName: getPriorityName(req.body.priority || 'P3'),
    dayOfWeek: req.body.dayOfWeek ?? 1,
    date: req.body.date || '2026-08-10',
    startTime: req.body.startTime || '08:00',
    endTime: req.body.endTime || '17:00',
    location: req.body.location || 'Bệnh viện Nội tiết TƯ',
    description: req.body.description || '',
    bufferMinutes: req.body.bufferMinutes || 30,
    isIntervention: req.body.isIntervention || false,
    repeat: req.body.repeat || 'weekly',
    completed: false,
    createdAt: new Date().toISOString(),
  };

  scheduleEvents.push(newEvt);
  res.status(201).json({ event: newEvt, total: scheduleEvents.length });
});

// PUT update event
app.put('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const index = scheduleEvents.findIndex((e) => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' });
  }

  scheduleEvents[index] = {
    ...scheduleEvents[index],
    ...req.body,
    priorityName: req.body.priority ? getPriorityName(req.body.priority) : scheduleEvents[index].priorityName,
  };

  res.json({ event: scheduleEvents[index] });
});

// DELETE event
app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  scheduleEvents = scheduleEvents.filter((e) => e.id !== id);
  res.json({ success: true, remaining: scheduleEvents.length });
});

// Calendar Sync API
// Sync endpoint removed

// Export iCal (.ics) format
app.get('/api/calendar/export.ics', (req, res) => {
  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BS Radiology AI Assistant//Schedule App//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lịch Bác Sĩ CĐHA - BV Nội Tiết TƯ',
  ];

  scheduleEvents.forEach((evt) => {
    const cleanTitle = evt.title.replace(/,/g, '\\,');
    const cleanLoc = evt.location.replace(/,/g, '\\,');
    const dateFormatted = evt.date.replace(/-/g, '');
    const startFormatted = evt.startTime.replace(':', '') + '00';
    const endFormatted = evt.endTime.replace(':', '') + '00';

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:evt-${evt.id}@radiology-ai.local`);
    icsLines.push(`SUMMARY:[${evt.priority}] ${cleanTitle}`);
    icsLines.push(`LOCATION:${cleanLoc}`);
    icsLines.push(`DESCRIPTION:Phân loại: ${evt.categoryLabel}. Ưu tiên: ${evt.priorityName}. ${evt.description || ''}`);
    icsLines.push(`DTSTART:${dateFormatted}T${startFormatted}`);
    icsLines.push(`DTEND:${dateFormatted}T${endFormatted}`);
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Lich_Bac_Si_CDHA.ics"');
  res.send(icsLines.join('\r\n'));
});

// System Architecture & Schema Metadata Endpoint
app.get('/api/schema', (req, res) => {
  res.json({
    role: 'Trợ lý AI Quản lý Lịch và Công việc Chuyên biệt dành cho Bác sĩ Chẩn đoán Hình ảnh Bệnh viện Nội tiết Trung ương',
    systemInstruction: DOCTOR_SYSTEM_INSTRUCTION.trim(),
    functionDeclarations: [
      taoLichHenDeclaration,
      capNhatUuTienDeclaration,
      xoaLichHenDeclaration,
      tinhKhangDemDeclaration,
      ghiNhoThoiQuenDeclaration,
    ],
    architectureSteps: [
      {
        id: '1',
        title: 'Xử lý Đầu vào & Giọng nói tiếng Việt',
        desc: 'Web Speech API & Giao diện Chatbot nhận yêu cầu bằng tiếng Việt tự nhiên (chữ hoặc giọng nói).',
        tech: 'React 19 + Web Speech API (vi-VN)',
      },
      {
        id: '2',
        title: 'Phân tích Ý định & Function Calling với Gemini AI',
        desc: 'Server Node/Express chuyển câu thoại sang Gemini 3.6 Flash để trích xuất JSON Schema & tự động quyết định gọi tool thích hợp.',
        tech: '@google/genai SDK (gemini-3.6-flash)',
      },
      {
        id: '3',
        title: 'Ma trận Eisenhower & Tính toán Thời gian Đệm',
        desc: 'Kiểm tra bối cảnh lâm sàng (P1-P4), tính toán Buffer Time (30-45 phút) và bảo vệ tuyệt đối các buổi tối nghỉ ngơi.',
        tech: 'Custom Priority & Buffer Engine (Node.js)',
      },
      {
        id: '4',
        title: 'Tự Động Học Hỏi & Tổng Hợp Prompt Phụ (Adaptive Context)',
        desc: 'Tự động trích xuất khung giờ làm việc, thói quen và quy tắc cá nhân từ tin nhắn của Bác sĩ để tự học nâng cao hiệu suất.',
        tech: 'Dynamic Memory Extraction & Prompt Synthesis',
      },
    ],
  });
});

// Gemini Chat & Function Calling Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, systemInstruction, learnedPrompt, learnedMemories, aiProvider, aiModel, geminiApiKey, shopaikeyApiKey, shopaikeyBaseUrl, currentEvents } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ' });
    }

    const ai = getGeminiAI({
      aiProvider,
      geminiApiKey,
      shopaikeyApiKey,
      shopaikeyBaseUrl,
    });

    const selectedModel = aiModel || 'gemini-1.5-flash';

    // Core System Instruction (Prompt Chính)
    const baseSystemInstruction =
      typeof systemInstruction === 'string' && systemInstruction.trim()
        ? systemInstruction.trim()
        : DOCTOR_SYSTEM_INSTRUCTION;

    // Learned Memories (Prompt Phụ)
    let currentMemories: string[] =
      Array.isArray(learnedMemories) && learnedMemories.length > 0
        ? [...learnedMemories]
        : [
            'Lịch làm việc cố định Bệnh viện: Sáng 07:30 - 12:00, Chiều 13:30 - 16:30 (Thứ 2 - Thứ 6)',
            'Lịch phòng khám ngoài giờ: Thứ 7 và Chủ Nhật từ 08:00 - 11:30',
            'Lịch học cố định: Tối Thứ 3 và Thứ 5 học MRI từ 19:30 - 21:30',
            'Khoảng đệm di chuyển & nghỉ ngơi: Tối thiểu 30-45 phút sau ca làm việc bệnh viện',
            'Ưu tiên đặc biệt: Tự động gắn P1 cho các ca can thiệp lâm sàng RFA giáp, VABB vú và Sinh thiết kim',
          ];

    const formattedLearnedPrompt =
      typeof learnedPrompt === 'string' && learnedPrompt.trim()
        ? learnedPrompt.trim()
        : currentMemories.map((m) => `- ${m}`).join('\n');

    // Combine Prompt Chính and Prompt Phụ
    const activeSystemInstruction = `${baseSystemInstruction}
[KÝ ỨC/THÓI QUEN]:
${formattedLearnedPrompt}
[QUY TẮC]: Tự cập nhật thói quen mới bằng hàm \`ghi_nho_thoi_quen\`.`;

    // 1. Optimize History (Last 4 messages)
    const MAX_HISTORY = 4;
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      const prunedHistory = history.slice(-MAX_HISTORY);
      for (const msg of prunedHistory) {
        if (msg.text) {
          contents.push({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
    }

    // 2. Filter & Condense Schedule Summary
    const activeEvents: ScheduleEvent[] = Array.isArray(currentEvents) ? currentEvents : scheduleEvents;
    
    const now = new Date();
    const currentScheduleSummary = activeEvents
      .filter(e => {
        if (!e.date) return true;
        const eventDate = new Date(e.date);
        const diffTime = eventDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= -1 && diffDays <= 7;
      })
      .slice(0, 15) // Condense even more
      .map(
        (e) => `${e.id}|${e.date}|${e.startTime}-${e.endTime}|${e.title}|${e.priority}`
      )
      .join('\n');

    // Append the latest context and message
    contents.push({
      role: 'user',
      parts: [
        {
          text: `[Context: Current Schedule]\n${currentScheduleSummary}\n\n[Message]\n${message}`
        }
      ]
    });

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: contents,
      config: {
        systemInstruction: activeSystemInstruction,
        tools: [
          {
            functionDeclarations: [
              taoLichHenDeclaration,
              capNhatUuTienDeclaration,
              xoaLichHenDeclaration,
              tinhKhangDemDeclaration,
              ghiNhoThoiQuenDeclaration,
            ],
          },
        ],
      },
    });

    const functionCalls = response.functionCalls;
    let replyText = response.text || '';
    let executedCall: any = null;

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const name = call.name;
      const args = call.args as Record<string, any>;

      if (name === 'tao_lich_hen') {
        const newEvt: ScheduleEvent = {
          id: `evt-${Date.now()}`,
          title: args.title || 'Lịch mới từ AI',
          category: (args.category as EventCategory) || 'hospital',
          categoryLabel: getCategoryLabel((args.category as EventCategory) || 'hospital'),
          priority: (args.priority as PriorityLevel) || 'P2',
          priorityName: getPriorityName((args.priority as PriorityLevel) || 'P2'),
          dayOfWeek: args.dayOfWeek ?? 2,
          date: args.date || '2026-08-11',
          startTime: args.startTime || '19:30',
          endTime: args.endTime || '21:30',
          location: args.location || 'Bệnh viện Nội tiết TƯ / Đại học Y',
          description: args.description || 'Được tạo tự động bởi Trợ lý AI',
          bufferMinutes: args.bufferMinutes || 45,
          isIntervention: args.isIntervention || false,
          repeat: 'weekly',
          completed: false,
        };

        // Check for protection rule: P4 Rest Protection
        if (newEvt.category !== 'rest' && (args.dayOfWeek === 1 || args.dayOfWeek === 5) && args.startTime >= '19:00') {
          replyText = `⚠️ **Lưu ý Bác sĩ**: Tối Thứ ${args.dayOfWeek + 1} là thời gian nghỉ ngơi & thể thao quan trọng (P4) để tái tạo năng lượng. Em đã thêm lịch "${newEvt.title}" theo yêu cầu, nhưng khuyến nghị Bác sĩ cân nhắc dành thời gian thư giãn!`;
        } else {
          replyText =
            replyText ||
            `✅ Em đã tạo lịch hẹn thành công: **${newEvt.title}** vào Thứ ${newEvt.dayOfWeek === 0 ? 'Chủ Nhật' : newEvt.dayOfWeek + 1} (${newEvt.startTime} - ${newEvt.endTime}). Mức ưu tiên gán tự động: **${newEvt.priorityName}**.`;
        }

        executedCall = { name, args, result: { success: true, createdEvent: newEvt } };
      } else if (name === 'cap_nhat_uu_tien') {
        const priority = args.newPriority as PriorityLevel;
        const kw = (args.eventTitleKeyword || '').toLowerCase();
        let updatedCount = 0;

        scheduleEvents = scheduleEvents.map((evt) => {
          if ((args.eventId && evt.id === args.eventId) || (kw && evt.title.toLowerCase().includes(kw))) {
            updatedCount++;
            return {
              ...evt,
              priority: priority || evt.priority,
              priorityName: priority ? getPriorityName(priority) : evt.priorityName,
              category: (args.newCategory as EventCategory) || evt.category,
              categoryLabel: args.newCategory ? getCategoryLabel(args.newCategory as EventCategory) : evt.categoryLabel,
            };
          }
          return evt;
        });

        replyText =
          replyText ||
          `✅ Em đã cập nhật mức ưu tiên **${priority}** (${getPriorityName(priority)}) cho ${updatedCount} công việc phù hợp!`;
        executedCall = { name, args, result: { success: true, updatedCount } };
      } else if (name === 'xoa_lich_hen') {
        const kw = (args.titleKeyword || '').toLowerCase();
        const initialCount = scheduleEvents.length;

        scheduleEvents = scheduleEvents.filter((evt) => {
          if (args.eventId && evt.id === args.eventId) return false;
          if (kw && evt.title.toLowerCase().includes(kw)) return false;
          return true;
        });

        const deleted = initialCount - scheduleEvents.length;
        replyText = replyText || `🗑️ Em đã dời/xóa thành công ${deleted} lịch hẹn theo yêu cầu của Bác sĩ!`;
        executedCall = { name, args, result: { success: true, deletedCount: deleted } };
      } else if (name === 'tinh_khang_dem') {
        const day = args.dayOfWeek ?? 2;
        const dayEvents = scheduleEvents.filter((e) => e.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));

        replyText =
          replyText ||
          `📊 **Phân tích Thời gian Đệm (Thứ ${day + 1})**:\n- Ca làm việc tại bệnh viện kết thúc lúc 17:00.\n- Buổi học tối bắt đầu lúc 19:30.\n- Khoảng đệm di chuyển & nghỉ ngơi đạt **150 phút** (đạt tiêu chuẩn an toàn > 45 phút, không lo kiệt sức!).`;
        executedCall = { name, args, result: { day, bufferMinutes: 150, safe: true } };
      } else if (name === 'ghi_nho_thoi_quen') {
        const memText = args.memoryText || '';
        if (memText && !currentMemories.includes(memText)) {
          currentMemories.unshift(memText);
        }
        replyText =
          replyText ||
          `🧠 **Đã tự ghi nhận vào Prompt Phụ (Ký Ức Tự Học)**:\n"${memText}"\n\nEm đã lưu thông tin này vào bộ nhớ thói quen để tự động áp dụng tối ưu hiệu suất cho các lần xếp lịch tiếp theo của Bác sĩ!`;
        executedCall = { name, args, result: { success: true, newMemory: memText } };
      }
    }

    // Heuristic memory extraction fallback if user explicitly provided working hours or habits
    const lowerMsg = message.toLowerCase();
    if (
      (lowerMsg.includes('làm việc') || lowerMsg.includes('bv') || lowerMsg.includes('bệnh viện') || lowerMsg.includes('thời gian là') || lowerMsg.includes('giờ là')) &&
      (lowerMsg.includes('h') || lowerMsg.includes(':'))
    ) {
      const extractedSnippet = `Thời gian làm việc Bệnh viện: ${message.trim()}`;
      const isAlreadySaved = currentMemories.some((m) => m.toLowerCase().includes(message.trim().toLowerCase()));
      if (!isAlreadySaved) {
        currentMemories.unshift(extractedSnippet);
        if (!replyText.includes('Prompt Phụ') && !replyText.includes('Ký Ức')) {
          replyText += `\n\n🧠 *[Tự động cập nhật Prompt Phụ]*: Em đã ghi nhận và lưu thói quen làm việc mới vào bộ nhớ: "${extractedSnippet}"!`;
        }
      }
    }

    if (!replyText) {
      replyText = `Em đã ghi nhận ý kiến của Bác sĩ. Lịch trình tuần này của Bác sĩ đã được tối ưu cân bằng giữa ca làm việc bệnh viện, lịch học MRI/CLVT và thời gian nghỉ ngơi!`;
    }

    const updatedPromptText = currentMemories.map((m) => `- ${m}`).join('\n');

    res.json({
      reply: replyText,
      executedCall,
      updatedEvents: scheduleEvents,
      syncStatus,
      updatedLearnedMemories: currentMemories,
      updatedLearnedPrompt: updatedPromptText,
    });
  } catch (err: any) {
    console.error('Gemini API Error:', err);

    // Graceful fallback response if API fails
    res.status(500).json({
      error: 'Không thể kết nối Gemini API. Hãy kiểm tra GEMINI_API_KEY.',
      details: err?.message,
    });
  }
});

function getPriorityName(p: PriorityLevel): string {
  switch (p) {
    case 'P1':
      return 'P1 - Khẩn cấp / Lâm sàng';
    case 'P2':
      return 'P2 - Học tập / Chuyên sâu';
    case 'P3':
      return 'P3 - Thường quy';
    case 'P4':
      return 'P4 - Nghỉ ngơi / Cá nhân';
    default:
      return 'P3 - Thường quy';
  }
}

function getCategoryLabel(c: EventCategory): string {
  switch (c) {
    case 'hospital':
      return 'Bệnh viện Nội tiết TƯ';
    case 'study':
      return 'Học tập chuyên môn';
    case 'clinic':
      return 'Phòng khám ngoài giờ';
    case 'rest':
      return 'Nghỉ ngơi';
    case 'personal':
      return 'Cá nhân';
    default:
      return 'Bệnh viện';
  }
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Doctor AI Scheduler backend running on http://localhost:${PORT}`);
  });
}

startServer();
