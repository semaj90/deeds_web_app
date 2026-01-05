// Toast utility for user notifications
export interface ToastOptions {
 duration?: number;
 type?: 'success' | 'error' | 'warning' | 'info';
}

export const toast = {
 success: (message: string, options: ToastOptions = {}) => {
 showToast(message, 'success', options);
 },
 error: (message: string, options: ToastOptions = {}) => {
 showToast(message, 'error', options);
 },
 warning: (message: string, options: ToastOptions = {}) => {
 showToast(message, 'warning', options);
 },
 info: (message: string, options: ToastOptions = {}) => {
 showToast(message, 'info', options);
 },
};

function showToast(message: string, type: string, options: ToastOptions = {}) {
 if (typeof document === 'undefined') return;

 // Create toast element
 const toastEl = document.createElement('div');
 toastEl.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full opacity-0 ${getToastStyles(type)}`;
 toastEl.textContent = message;

 // Add to DOM
 document.body.appendChild(toastEl);

 // Animate in
 requestAnimationFrame(() => {
 toastEl.style.transform = 'translateX(0)';
 toastEl.style.opacity = '1';
 });
  
 setTimeout(() => {
 toastEl.style.transform = 'translateX(100%)';
 toastEl.style.opacity = '0';
 setTimeout(() => {
 if (toastEl.parentNode) {
 document.body.removeChild(toastEl);
 }
 }, 300);
 }, options.duration || 3000);
}

function getToastStyles(type: string): string {
 const styles: Record<string, string> = {
 success: 'bg-green-500 text-white',
 error: 'bg-red-500 text-white',
 warning: 'bg-yellow-500 text-black',
 info: 'bg-blue-500 text-white',
 };
 return styles[type] || styles.info;
}
