import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';

export function LoginScreen() {
  const { login, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-center space-y-6 shadow-2xl"
      >
        <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
          <LogIn className="w-10 h-10 text-indigo-400" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Chào mừng Bác sĩ</h1>
          <p className="text-slate-400">Đăng nhập để quản lý thời gian biểu và trợ lý AI của bạn</p>
        </div>

        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-950 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all active:scale-[0.98] shadow-lg"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Tiếp tục với Google
        </button>

        <p className="text-[11px] text-slate-500">
          Bằng cách đăng nhập, bạn đồng ý với các quy tắc bảo mật và quản lý dữ liệu của hệ thống.
        </p>
      </motion.div>
    </div>
  );
}
