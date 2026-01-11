export const WorkspaceStore = {
 active: $state('cases'), // default tab
 theme: $state('light'), // light or dark

 set(tab) {
 this.active = tab;
 if (tab === 'ai' || tab === 'terminal') {
 this.theme = 'dark';
 } else {
 this.theme = 'light';
 }
 },
};
