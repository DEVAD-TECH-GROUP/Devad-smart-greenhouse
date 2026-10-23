import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4200);
  }, []);

  const toast = { ok: (m) => push(m, 'ok'), error: (m) => push(m, 'error') };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="panel flex items-start gap-3 px-4 py-3 text-sm shadow-xl">
            {i.kind === 'ok'
              ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-leaf" />
              : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bloom" />}
            <span>{i.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
