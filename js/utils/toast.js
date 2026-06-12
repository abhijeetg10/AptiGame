export const Toast = {
    init() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    },

    show(message, type = 'info', duration = 4000) {
        this.init();
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `apti-toast ${type}`;
        
        let icon = 'fa-info-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'warning') icon = 'fa-exclamation-triangle';

        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toast-fade-out 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};
