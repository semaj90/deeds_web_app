export interface ReportSettings {
    layout: "single" | "dual" | "masonry";
    autoSave: boolean;
}

export interface ReportMetadata {
    status: string;
    updatedAt: Date;
}

export interface Evidence {
    id: string;
    title: string;
    url?: string;
    file?: File;
    description: string;
    tags: string[];
}

export interface ReportStoreState {
    id: string;
    title: string;
    content: string;
    settings: ReportSettings;
    metadata: ReportMetadata;
    evidence: Evidence[];
}

export interface ReportUIState {
    sidebarOpen: boolean;
    sidebarWidth: number;
    fullscreen: boolean;
}

export interface EditorState {
    wordCount: number;
}





