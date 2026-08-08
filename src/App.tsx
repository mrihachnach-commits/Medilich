import React, { useState, useEffect } from 'react';
import { ScheduleEvent, ChatMessage, PriorityLevel, AppSettings, DEFAULT_APP_SETTINGS } from './types';
import { INITIAL_EVENTS } from './data/initialData';
import { Navbar } from './components/Navbar';
import { CalendarView } from './components/CalendarView';
import { EisenhowerMatrix } from './components/EisenhowerMatrix';
import { SmartAnalytics } from './components/SmartAnalytics';
import { SystemArchitectureInspector } from './components/SystemArchitectureInspector';
import { ChatbotWidget } from './components/ChatbotWidget';
import { SettingsModal } from './components/SettingsModal';
import { useAuth } from './contexts/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { 
  getEvents, 
  createEvent, 
  updateEvent as fsUpdateEvent, 
  deleteEvent as fsDeleteEvent, 
  getUserSettings, 
  saveUserSettings 
} from './lib/firestoreUtils';

export default function App() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'calendar' | 'matrix' | 'analytics' | 'architecture'>('calendar');
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'assistant',
      text: `Xin chào Bác sĩ! Em là Trợ lý AI Quản lý Lịch & Công việc Chuyên biệt. Bác sĩ cần em thêm, dời lịch hay sắp xếp công việc ưu tiên Eisenhower không ạ?`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Load events and settings from Firestore when user logs in
  useEffect(() => {
    if (user) {
      const loadUserData = async () => {
        try {
          const fsEvents = await getEvents(user.uid);
          if (fsEvents && fsEvents.length > 0) {
            setEvents(fsEvents as ScheduleEvent[]);
          } else {
            // Seed with initial events if none found for new user
            for (const event of INITIAL_EVENTS) {
              await createEvent(user.uid, event);
            }
            const seededEvents = await getEvents(user.uid);
            setEvents(seededEvents as ScheduleEvent[]);
          }

          const fsSettings = await getUserSettings(user.uid);
          if (fsSettings) {
            setSettings(fsSettings);
          }
        } catch (error) {
          console.error("Error loading user data from Firestore:", error);
        }
      };
      loadUserData();
    }
  }, [user]);

  // Web Speech API Voice Recognition
  useEffect(() => {
    let recognition: any = null;
    if (isVoiceActive) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) handleSendMessage(transcript);
          setIsVoiceActive(false);
        };
        recognition.onerror = () => setIsVoiceActive(false);
        recognition.onend = () => setIsVoiceActive(false);
        recognition.start();
      } else {
        alert('Trình duyệt không hỗ trợ nhận diện giọng nói!');
        setIsVoiceActive(false);
      }
    }
    return () => recognition?.abort();
  }, [isVoiceActive]);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (user) {
      await saveUserSettings(user.uid, newSettings);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Handle Add Event
  const handleAddEvent = async (newEventData: Partial<ScheduleEvent>) => {
    if (user) {
      const created = await createEvent(user.uid, newEventData);
      if (created) {
        setEvents((prev) => [...prev, created as ScheduleEvent]);
      }
    }
  };

  // Handle Update Event
  const handleUpdateEvent = async (id: string, updates: Partial<ScheduleEvent>) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );

    if (user) {
      await fsUpdateEvent(user.uid, id, updates);
    }
  };

  // Handle Delete Event
  const handleDeleteEvent = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (user) {
      await fsDeleteEvent(user.uid, id);
    }
  };

  // Send Message to Gemini AI Assistant
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatOpen(true);
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatMessages.slice(-6),
          systemInstruction: settings.systemInstruction,
          learnedPrompt: settings.learnedPrompt,
          learnedMemories: settings.learnedMemories,
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          geminiApiKey: settings.geminiApiKey,
          shopaikeyApiKey: settings.shopaikeyApiKey,
          shopaikeyBaseUrl: settings.shopaikeyBaseUrl,
          // Pass context events for AI
          currentEvents: events,
        }),
      });

      const data = await res.json();
      const aiMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'Em đã ghi nhận ý kiến của Bác sĩ.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        functionCalled: data.executedCall,
      };

      setChatMessages((prev) => [...prev, aiMsg]);

      // Handle function calling results locally
      if (data.executedCall && user) {
        const { name, args, result } = data.executedCall;
        
        if (name === 'tao_lich_hen' && result?.createdEvent) {
          // The AI suggested creating an event, let's actually save it to Firestore
          const newEvent = { ...result.createdEvent, userId: user.uid };
          const created = await createEvent(user.uid, newEvent);
          if (created) {
            setEvents(prev => [...prev, created as ScheduleEvent]);
          }
        } else if (name === 'xoa_lich_hen') {
          const kw = (args.titleKeyword || '').toLowerCase();
          const toDelete = events.filter(e => e.title.toLowerCase().includes(kw));
          for (const evt of toDelete) {
            await handleDeleteEvent(evt.id);
          }
        } else if (name === 'cap_nhat_uu_tien') {
          const kw = (args.eventTitleKeyword || '').toLowerCase();
          const priority = args.newPriority;
          const toUpdate = events.filter(e => e.title.toLowerCase().includes(kw));
          for (const evt of toUpdate) {
            await handleUpdateEvent(evt.id, { priority, priorityName: priority }); // priorityName will be handled by types or utility
          }
        } else if (name === 'ghi_nho_thoi_quen') {
          const memory = args.memoryText || args.habitDescription || '';
          if (memory) {
            const updatedMemories = [memory, ...(settings.learnedMemories || [])];
            const newSettings = {
              ...settings,
              learnedMemories: updatedMemories,
              learnedPrompt: updatedMemories.map(m => `- ${m}`).join('\n')
            };
            handleSaveSettings(newSettings);
          }
        }
      }

    } catch (err) {
      console.error('Chat error', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Web Speech API Voice Recognition (Removed Duplicate)
  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        isVoiceActive={isVoiceActive}
        onToggleVoice={() => setIsVoiceActive((prev) => !prev)}
      />

      {/* Main Body with Split View Layout when Chat is Open */}
      <div className="flex-1 flex relative w-full overflow-x-hidden">
        {/* Main Web Content - Shrinks/shifts to the left when AI assistant is open */}
        <div
          className={`flex-1 transition-all duration-300 ease-in-out min-w-0 flex flex-col ${
            isChatOpen ? 'mr-0 md:mr-[380px] lg:mr-[420px]' : 'mr-0'
          }`}
        >
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
            {activeTab === 'calendar' && (
              <CalendarView
                events={events}
                settings={settings}
                onAddEvent={handleAddEvent}
                onUpdateEvent={handleUpdateEvent}
                onDeleteEvent={handleDeleteEvent}
                onQuickAskAI={(prompt) => handleSendMessage(prompt)}
              />
            )}

            {activeTab === 'matrix' && (
              <EisenhowerMatrix
                events={events}
                settings={settings}
                onUpdatePriority={(id, newPriority) => handleUpdateEvent(id, { priority: newPriority })}
                onToggleComplete={(id, completed) => handleUpdateEvent(id, { completed })}
                onUpdateEvent={handleUpdateEvent}
                onDeleteEvent={handleDeleteEvent}
              />
            )}

            {activeTab === 'analytics' && <SmartAnalytics events={events} settings={settings} />}

            {activeTab === 'architecture' && <SystemArchitectureInspector />}
          </main>

          {/* Footer */}
          <footer className="border-t border-slate-800/60 bg-[#0F172A]/80 py-4 px-6 text-center text-xs text-slate-400">
            <p>
              {settings.siteTitle} • {settings.doctorTitle} • {settings.hospitalName} • Quản lý Lịch & Ma trận Eisenhower
            </p>
          </footer>
        </div>

        {/* AI Assistant Chatbot Panel - Positioned on the Right Side */}
        <ChatbotWidget
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isLoading={isAiLoading}
          isVoiceActive={isVoiceActive}
          onToggleVoice={() => setIsVoiceActive((prev) => !prev)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          learnedMemoriesCount={settings.learnedMemories?.length || 5}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}

