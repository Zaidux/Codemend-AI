import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration || 4000;
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300);

    const removeTimer = setTimeout(() => {
      onRemove(toast.id);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast, onRemove]);

  const getToastStyles = () => {
    const baseStyles = 'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-xl';
    
    switch (toast.type) {
      case 'success':
        return `${baseStyles} bg-green-500/20 border-green-500/40 text-green-100`;
      case 'error':
        return `${baseStyles} bg-red-500/20 border-red-500/40 text-red-100`;
      case 'warning':
        return `${baseStyles} bg-yellow-500/20 border-yellow-500/40 text-yellow-100`;
      case 'info':
      default:
        return `${baseStyles} bg-blue-500/20 border-blue-500/40 text-blue-100`;
    }
  };

  const getIcon = () => {
    const iconClass = 'w-5 h-5 flex-shrink-0';
    switch (toast.type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-400`} />;
      case 'error':
        return <XCircle className={`${iconClass} text-red-400`} />;
      case 'warning':
        return <AlertCircle className={`${iconClass} text-yellow-400`} />;
      case 'info':
      default:
        return <Info className={`${iconClass} text-blue-400`} />;
    }
  };

  return (
    <div
      className={`${getToastStyles()} transition-all duration-300 ${
        isExiting 
          ? 'translate-x-full opacity-0' 
          : 'translate-x-0 opacity-100'
      } animate-slideInRight`}
      style={{
        animation: isExiting ? 'slideOutRight 0.3s ease-out forwards' : 'slideInRight 0.3s ease-out'
      }}
    >
      {getIcon()}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => onRemove(toast.id), 300);
        }}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

// Hook for easy toast management
export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: ToastType, message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showSuccess = (message: string, duration?: number) => addToast('success', message, duration);
  const showError = (message: string, duration?: number) => addToast('error', message, duration);
  const showInfo = (message: string, duration?: number) => addToast('info', message, duration);
  const showWarning = (message: string, duration?: number) => addToast('warning', message, duration);

  return {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showError,
    showInfo,
    showWarning
  };
};
