import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  const icons = { success: CheckCircle, error: AlertCircle, info: Info, warning: AlertTriangle };
  const Icon = icons[toast.type];
  const colors = {
    success: 'border-green-300 bg-green-50 text-green-700',
    error: 'border-red-300 bg-red-50 text-red-700',
    info: 'border-blue-300 bg-blue-50 text-blue-700',
    warning: 'border-amber-300 bg-amber-50 text-amber-700',
  };

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border min-w-[280px] max-w-sm shadow-lg animate-slide-in ${colors[toast.type]}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onRemove={onRemove} />)}
    </div>
  );
}

let _addToast: ((msg: string, type: ToastType) => void) | null = null;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  _addToast = addToast;

  return { toasts, addToast, removeToast };
}

export function toast(message: string, type: ToastType = 'info') {
  _addToast?.(message, type);
}
