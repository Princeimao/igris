export interface IgrisAPI {
    chat: (prompt: string, options?: {
        isLongRunning?: boolean;
        requiresBrowser?: boolean;
    }) => Promise<{
        id: string;
        content: string;
        status: 'completed' | 'failed';
        route: 'pi' | 'hive';
        error?: string;
    }>;
    checkHiveStatus: () => Promise<boolean>;
    getMemories: (type?: 'personal' | 'project' | 'agent') => Promise<Array<{
        id: string;
        type: string;
        content: string;
        tags: string[];
        createdAt: string;
    }>>;
    resizeWindow: (expanded: boolean) => Promise<void>;
    minimizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
}
//# sourceMappingURL=index.d.ts.map