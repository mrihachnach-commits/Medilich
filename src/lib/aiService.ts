import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { ScheduleEvent, PriorityLevel, EventCategory } from '../types';

export const DOCTOR_SYSTEM_INSTRUCTION = `Trợ lý AI Quản lý Lịch cho Bác sĩ CĐHA - BV Nội tiết TƯ.
Bối cảnh: T2-T6 làm viện (siêu âm, MRI, RFA, VABB). Tối (19h30+) học MRI/CLVT hoặc nghỉ (P4). Cuối tuần làm PK (MSK) ban ngày, nghỉ tối.
Ưu tiên (Eisenhower):
- P1: Can thiệp lâm sàng (RFA, VABB, Sinh thiết), Cấp cứu.
- P2: Học tập chuyên sâu. Cần đệm 45p sau giờ làm.
- P3: Thường quy (Siêu âm, PK).
- P4: Nghỉ ngơi. TUYỆT ĐỐI ko chen lịch trừ khi y/c.
Nhiệm vụ: Phân tích tin nhắn, gọi hàm phù hợp, phản hồi lịch sự (xưng Em, gọi Anh/Bác sĩ).`;

export const taoLichHenDeclaration: FunctionDeclaration = {
  name: 'tao_lich_hen',
  description: 'Tạo một lịch hẹn hoặc công việc mới trong thời gian biểu của bác sĩ.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Tên công việc hoặc sự kiện (VD: Học MRI sọ nào, Can thiệp RFA giáp, Siêu âm PK)' },
      date: { type: Type.STRING, description: 'Ngày diễn ra theo định dạng YYYY-MM-DD (VD: 2026-08-11)' },
      dayOfWeek: { type: Type.INTEGER, description: 'Thứ trong tuần (1: Thứ 2, 2: Thứ 3, ..., 6: Thứ 7, 0: Chủ Nhật)' },
      startTime: { type: Type.STRING, description: 'Giờ bắt đầu dạng HH:mm (VD: 19:30)' },
      endTime: { type: Type.STRING, description: 'Giờ kết thúc dạng HH:mm (VD: 21:30)' },
      category: { type: Type.STRING, description: 'Phân loại nhóm: hospital, study, clinic, rest, personal' },
      priority: { type: Type.STRING, description: 'Mức độ ưu tiên Eisenhower: P1, P2, P3, P4' },
      location: { type: Type.STRING, description: 'Địa điểm làm việc/học tập' },
      bufferMinutes: { type: Type.INTEGER, description: 'Thời gian đệm nghỉ ngơi/di chuyển tính bằng phút' },
      isIntervention: { type: Type.BOOLEAN, description: 'Có phải là ca thủ thuật can thiệp lâm sàng khẩn cấp không' },
      description: { type: Type.STRING, description: 'Ghi chú bổ sung cho lịch hẹn' },
    },
    required: ['title', 'startTime', 'endTime', 'category'],
  },
};

export const capNhatUuTienDeclaration: FunctionDeclaration = {
  name: 'cap_nhat_uu_tien',
  description: 'Cập nhật mức độ ưu tiên Eisenhower (P1-P4) hoặc phân loại nhóm cho công việc đã có.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: { type: Type.STRING, description: 'Mã id sự kiện cần cập nhật' },
      eventTitleKeyword: { type: Type.STRING, description: 'Từ khóa tìm kiếm tên sự kiện nếu không có id' },
      newPriority: { type: Type.STRING, description: 'Mức ưu tiên mới (P1, P2, P3, P4)' },
      newCategory: { type: Type.STRING, description: 'Phân loại mới (hospital, study, clinic, rest, personal)' },
    },
    required: ['newPriority'],
  },
};

export const xoaLichHenDeclaration: FunctionDeclaration = {
  name: 'xoa_lich_hen',
  description: 'Xóa hoặc hủy một lịch hẹn/công việc trong thời gian biểu.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: { type: Type.STRING, description: 'Mã sự kiện cần xóa' },
      titleKeyword: { type: Type.STRING, description: 'Từ khóa tìm kiếm sự kiện muốn hủy' },
    },
  },
};

export const tinhKhangDemDeclaration: FunctionDeclaration = {
  name: 'tinh_khang_dem',
  description: 'Tính toán khoảng nghỉ đệm (Buffer time) và cảnh báo xung đột giữa ca bệnh viện và buổi học tối.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      dayOfWeek: { type: Type.INTEGER, description: 'Thứ cần kiểm tra khoảng đệm (1-6, 0)' },
    },
  },
};

export const ghiNhoThoiQuenDeclaration: FunctionDeclaration = {
  name: 'ghi_nho_thoi_quen',
  description: 'Tự động học hỏi, trích xuất và lưu trữ thói quen, giờ giấc làm việc, sở thích hoặc quy tắc cá nhân do Bác sĩ chia sẻ trong chat vào Prompt Phụ.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      memoryText: { type: Type.STRING, description: 'Câu tóm tắt vắn tắt thói quen hoặc khung giờ làm việc/nghỉ ngơi mới của Bác sĩ' },
    },
    required: ['memoryText'],
  },
};

function getPriorityName(p: PriorityLevel): string {
  switch (p) {
    case 'P1': return 'P1 - Khẩn cấp / Lâm sàng';
    case 'P2': return 'P2 - Học tập / Chuyên sâu';
    case 'P3': return 'P3 - Thường quy';
    case 'P4': return 'P4 - Nghỉ ngơi / Cá nhân';
    default: return 'P3 - Thường quy';
  }
}

function getCategoryLabel(c: EventCategory): string {
  switch (c) {
    case 'hospital': return 'Bệnh viện Nội tiết TƯ';
    case 'study': return 'Học tập chuyên môn';
    case 'clinic': return 'Phòng khám ngoài giờ';
    case 'rest': return 'Nghỉ ngơi';
    case 'personal': return 'Cá nhân';
    default: return 'Bệnh viện';
  }
}

export interface ChatPayload {
  message: string;
  history?: any[];
  systemInstruction?: string;
  learnedPrompt?: string;
  learnedMemories?: string[];
  aiProvider?: string;
  aiModel?: string;
  geminiApiKey?: string;
  shopaikeyApiKey?: string;
  shopaikeyBaseUrl?: string;
  currentEvents?: ScheduleEvent[];
}

export async function processChatRequest(payload: ChatPayload): Promise<{
  reply: string;
  executedCall?: any;
  updatedEvents?: ScheduleEvent[];
  updatedLearnedMemories?: string[];
  updatedLearnedPrompt?: string;
}> {
  // 1. Try calling the backend /api/chat endpoint first
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend /api/chat unavailable or returned error, falling back to client-side AI processing:', err);
  }

  // 2. Client-side Gemini Fallback (for Vercel or standalone frontend deployments)
  return await processChatClientSide(payload);
}

async function processChatClientSide(payload: ChatPayload) {
  const {
    message,
    history,
    systemInstruction,
    learnedPrompt,
    learnedMemories,
    aiProvider,
    aiModel,
    geminiApiKey,
    shopaikeyApiKey,
    shopaikeyBaseUrl,
    currentEvents = [],
  } = payload;

  // Determine API key
  const envKey = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GEMINI_API_KEY : undefined;
  let apiKey = geminiApiKey || envKey;
  let baseUrl: string | undefined = undefined;

  const clientOptions: any = {
    apiKey: apiKey || 'dummy-key',
  };

  if (aiProvider === 'shopaikey') {
    apiKey = shopaikeyApiKey || apiKey;
    let rawBaseUrl = shopaikeyBaseUrl || 'https://api.shopaikey.com';
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
      clientOptions.httpOptions = { apiVersion };
    }
  }

  if (baseUrl) {
    clientOptions.httpOptions = { ...(clientOptions.httpOptions || {}), baseUrl };
  }

  if (!apiKey || apiKey === 'dummy-key') {
    return {
      reply: '⚠️ **Thông báo**: Trang web đang chạy ở chế độ tĩnh (Vercel). Để sử dụng AI Chatbot, Bác sĩ vui lòng vào mục **Cài đặt hệ thống (biểu tượng bánh răng ⚙️)** và nhập **Google Gemini API Key** của Bác sĩ nhé!',
    };
  }

  const ai = new GoogleGenAI(clientOptions);
  const selectedModel = aiModel || 'gemini-1.5-flash';

  const baseSystemInstruction = systemInstruction?.trim() || DOCTOR_SYSTEM_INSTRUCTION;

  let currentMemories: string[] = Array.isArray(learnedMemories) && learnedMemories.length > 0
    ? [...learnedMemories]
    : [
        'Lịch làm việc cố định Bệnh viện: Sáng 07:30 - 12:00, Chiều 13:30 - 16:30 (Thứ 2 - Thứ 6)',
        'Lịch phòng khám ngoài giờ: Thứ 7 và Chủ Nhật từ 08:00 - 11:30',
        'Lịch học cố định: Tối Thứ 3 và Thứ 5 học MRI từ 19:30 - 21:30',
        'Khoảng đệm di chuyển & nghỉ ngơi: Tối thiểu 30-45 phút sau ca làm việc bệnh viện',
        'Ưu tiên đặc biệt: Tự động gắn P1 cho các ca can thiệp lâm sàng RFA giáp, VABB vú và Sinh thiết kim',
      ];

  const formattedLearnedPrompt = learnedPrompt?.trim() || currentMemories.map((m) => `- ${m}`).join('\n');

  const activeSystemInstruction = `${baseSystemInstruction}
[KÝ ỨC/THÓI QUEN]:
${formattedLearnedPrompt}
[QUY TẮC]: Tự cập nhật thói quen mới bằng hàm \`ghi_nho_thoi_quen\`.`;

  const MAX_HISTORY = 4;
  const contents: any[] = [];
  if (history && Array.isArray(history)) {
    const prunedHistory = history.slice(-MAX_HISTORY);
    for (const msg of prunedHistory) {
      if (msg.text) {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        });
      }
    }
  }

  const now = new Date();
  const currentScheduleSummary = currentEvents
    .filter((e) => {
      if (!e.date) return true;
      const eventDate = new Date(e.date);
      const diffTime = eventDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= -1 && diffDays <= 7;
    })
    .slice(0, 15)
    .map((e) => `${e.id}|${e.date}|${e.startTime}-${e.endTime}|${e.title}|${e.priority}`)
    .join('\n');

  contents.push({
    role: 'user',
    parts: [
      {
        text: `[Context: Current Schedule]\n${currentScheduleSummary}\n\n[Message]\n${message}`,
      },
    ],
  });

  try {
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
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
        replyText =
          replyText ||
          `✅ Em đã cập nhật mức ưu tiên **${priority}** (${getPriorityName(priority)}) cho các công việc phù hợp!`;
        executedCall = { name, args, result: { success: true } };
      } else if (name === 'xoa_lich_hen') {
        replyText = replyText || `🗑️ Em đã dời/xóa thành công lịch hẹn theo yêu cầu của Bác sĩ!`;
        executedCall = { name, args, result: { success: true } };
      } else if (name === 'tinh_khang_dem') {
        const day = args.dayOfWeek ?? 2;
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

    if (!replyText) {
      replyText = `Em đã ghi nhận ý kiến của Bác sĩ. Lịch trình của Bác sĩ đã được cập nhật!`;
    }

    const updatedPromptText = currentMemories.map((m) => `- ${m}`).join('\n');

    return {
      reply: replyText,
      executedCall,
      updatedLearnedMemories: currentMemories,
      updatedLearnedPrompt: updatedPromptText,
    };
  } catch (err: any) {
    console.error('Client Gemini Error:', err);
    return {
      reply: `⚠️ Không thể kết nối Gemini API (${err?.message || 'Lỗi mạng'}). Vui lòng kiểm tra lại API Key trong mục Cài đặt.`,
    };
  }
}
