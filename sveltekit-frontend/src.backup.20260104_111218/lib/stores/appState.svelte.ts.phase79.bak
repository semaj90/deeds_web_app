export const appState = new class AppState {
    isSidebarOpen = $state(true);
    activeCaseId = $state<string | null>(null);
    globalError = $state<string | null>(null);

    toggleSidebar() {
        this.isSidebarOpen = !this.isSidebarOpen;
    }

    setError(msg: string) {
        this.globalError = msg;
        setTimeout(() => this.globalError = null, 5000);
    }
}
