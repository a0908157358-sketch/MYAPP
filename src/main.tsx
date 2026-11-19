import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// 清理舊版殘留之 FCM Service Worker，避免影響啟動與快取
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        const scriptUrl =
          reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (scriptUrl.includes('firebase-messaging-sw')) {
          void reg.unregister();
        }
      });
    })
    .catch(() => {
      // 忽略瀏覽器不支援或權限限制
    });
}

try {
  registerSW({
    immediate: true,
    onRegisterError(err) {
      console.warn('[PWA SW Register]', err);
    },
  });
} catch {
  // 忽略 SW 註冊異常以免阻塞主程式啟動
}

createRoot(document.getElementById('root')!).render(<App />);
