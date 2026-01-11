export const concurrentSearch = {
 initialize: async () => {
 console.log('concurrentSearch initialized');
 },
 search: async (query) => {
 console.log('concurrentSearch search:', query);
 return [];
 },
 indexTypeScriptErrors: async (errors) => {
 console.log('concurrentSearch indexTypeScriptErrors:', errors);
 },
};
