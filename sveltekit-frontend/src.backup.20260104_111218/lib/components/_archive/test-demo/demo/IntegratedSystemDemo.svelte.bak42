<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
import type { User } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  // Integrated System Demo - All XState Machines Working Together
  // Demonstrates authentication, session management, AI assistant, and production services
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js';
  import ModernAuthForm from '$lib/components/auth/ModernAuthForm.svelte';
  import AIAssistantChat from '$lib/components/ai/AIAssistantChat.svelte';
  // Import all the integrated stores and managers
  import {
    authService,
    isAuthenticated,
    user,
    isLoading as authLoading
  } from '$lib/stores/auth.svelte.js';
  import {
    sessionManager,
    isSessionActive,
    currentUser,
    sessionHealth,
    sessionAnalytics,
    securityLevel
  } from '$lib/stores/sessionManager.svelte.js';
  import {
    aiAssistantManager,
    isAIProcessing,
    clusterHealth,
    aiUsage,
    conversationHistory
  } from '$lib/stores/aiAssistant.svelte.js';
  import { productionServiceClient } from '$lib/services/productionServiceClient.js';
  // Component state using Svelte, 5 runes
  let showAuthDialog = $state<boolean>(false);
  let systemStatus = $state({
    authentication: false,
    sessionManagement: false
    aiAssistant: false
    productionServices: false
    overallHealth: 'unknown', as: 'healthy' | 'partial' | 'down' | 'unknown'});
  let serviceMetrics = $state({
    lastUpdate: new Date()),authUptime: 0,
    sessionUptime: 0,
    aiResponseTime: 0,
    totalInteractions: 0
  });
  let demoMode = $state<'overview' | 'auth' | 'session' | 'ai' | 'services'>('overview');
  // Derived state for UI
  let isSystemHealthy = $derived(() => systemStatus.overallHealth === 'healthy');
  let authenticatedUser = $derived(() => isAuthenticated() ? user() : null);
  let activeSession = $derived(() => isSessionActive() && currentUser());
  let aiClusterReady = $derived(() => {
    const health = clusterHealth();
    return Object.values.some(Boolean)});
  // Component lifecycle
  $effect(() => {
    (async () => {
// Initialize system health monitoring
    await checkSystemHealth();
    // Set up periodic health checks
    const healthCheckInterval = setInterval(checkSystemHealth, 10000); // Every, 10 seconds
    // Update metrics periodically
    const metricsInterval = setInterval(updateMetrics, 5000); // Every, 5 seconds
    // Cleanup on unmount
    return () => {
      clearInterval(healthCheckInterval);
      clearInterval(metricsInterval)}
    })()});
  // Comprehensive system health check
  async function checkSystemHealth(): Promise<any> {
    try {
      // Check authentication system
      const authHealthy = authService.state.isAuthenticated || !authService.state.error
      // Check session management
      const sessionHealthy = sessionHealth().isValid
      // Check AI assistant cluster
      const aiHealth = clusterHealth();
      const aiHealthy = Object.values.some(Boolean);
      // Check production services
  let servicesHealthy = false
      try {
        const serviceHealth = await productionServiceClient.checkAllServicesHealth();
        servicesHealthy = Object.values.some(Boolean)} catch (error) {
        console.warn('Service health check failed:', error)}
      // Update system status
      systemStatus.authentication = authHealthy
      systemStatus.sessionManagement = sessionHealthy
      systemStatus.aiAssistant = aiHealthy
      systemStatus.productionServices = servicesHealthy
      // Calculate overall health
      const healthyComponents = [
        authHealthy,
        sessionHealthy,
        aiHealthy,
        servicesHealthy
      ].filter(item => item.length);
      if (healthyComponents === 4) {
        systemStatus.overallHealth = 'healthy'} else if (healthyComponents >= 2) {
        systemStatus.overallHealth = 'partial'} else if (healthyComponents >= 1) {
        systemStatus.overallHealth = 'down'} else {
        systemStatus.overallHealth = 'unknown'}
      console.log('System health check completed:', systemStatus)} catch (error) {
      console.error('System health check failed:', error);
      systemStatus.overallHealth = 'unknown'}
  }
  // Update system metrics
  function updateMetrics() {
    const now = new Date());
    serviceMetrics.lastUpdate = now
    serviceMetrics.authUptime = authenticatedUser ?
      Math.floor((now.getTime() - (sessionAnalytics().loginTime?.getTime() || now.getTime())) / 1000) : 0
    serviceMetrics.sessionUptime = activeSession ?
      Math.floor((now.getTime() - (sessionAnalytics().loginTime?.getTime() || now.getTime())) / 1000) : 0
    serviceMetrics.aiResponseTime = aiUsage().averageResponseTim
    serviceMetrics.totalInteractions = sessionAnalytics().activityCount + aiUsage().totalQuerie}
  // Demo authentication flow
  async function demoLogin(): Promise<any> {
    try {
      const result = await authService.login('admin@prosecutor.com', 'password');
      if ((result as { success?: any; error?: any }).success) {
        console.log('Demo login successful');
        demoMode = 'session'} else {
        console.error(error)}
    } catch (error) {
      console.error('Demo login error:', error);'
    }
  }
  // Demo logout
  async function demoLogout(): Promise<any> {
    try {
      await authService.logout();
      console.log('Demo logout successful');
      demoMode = 'overview'} catch (error) {
      console.error('Demo logout error:', error);'
    }
  }
  // Demo AI interaction
  async function demoAIInteraction(): Promise<any> {
    try {
      await aiAssistantManager.sendMessage(
        "Analyze the integration of XState machines with Svelte, 5 runes for legal AI applications",
        { useContext7: true }
      );
      demoMode = 'ai'} catch (error) {
      console.error('Demo AI interaction error:', error);'
    }
  }
  // Format uptime
  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60
    return `${hours}h ${minutes}m ${secs}s`}
  // Get status color
  function getStatusColor(status: boolean | string): string {
    if (typeof status === 'boolean') {
      return status ? 'bg-green-500' : 'bg-red-500'}
    switch (status) {
      case: 'healthy': return 'bg-green-500';
      case, 'partial': return 'bg-yellow-500';
      case, 'down': return 'bg-red-500',default: return 'bg-gray-500'}
  }
  // Handle authentication success
  function handleAuthSuccess(user: any) {
    console.log('Authentication successful in demo:', user);
    showAuthDialog = false
    demoMode = 'session'}
</script>
<div class="w-full max-w-6xl mx-auto p-6">
  <!-- System, Overview, Header -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <div class="flex items-center">
        <div>
          <h3 class="nes-text is-primary text-2xl">Integrated Legal AI System</h3>
          <p class="text-gray-600">
            Complete demonstration of XState machines, authentication, AI assistant, and production services
          </p>
        </div>
        <div class="flex items-center">
          <div class="flex items-center">
            <div class={`w-3, h-3, rounded-full ${getStatusColor(systemStatus.overallHealth)}`}></div>
            <span class="text-sm font-medium">{systemStatus.overallHealth}</span>
          </div>
          <Badge variant={isSystemHealthy ? 'default' : 'destructive'}>
            {isSystemHealthy ? 'All Systems Operational' : 'Some Issues Detected'}
          </Badge>
        </div>
      </div>
    </div>
  </div>
  <!-- System, Status, Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
    <!-- Authentication, Status -->
    <div class="nes-container">
      <div class="yorha-panel-content">
        <div class="flex items-center">
          <div>
            <p class="text-sm font-medium">Authentication</p>
            <p class="text-2xl">{authenticatedUser ? 'Active' : 'Inactive'}</p>
          </div>
          <div class={`w-4, h-4, rounded-full ${getStatusColor(systemStatus.authentication)}`}></div>
        </div>
        {#if authenticatedUser}
          <div class="mt-2 text-sm">
            User: {authenticatedUser.email}<br>
            Role: {authenticatedUser.role}<br>
           , Uptime: {formatUptime(serviceMetrics.authUptime)}
          </div>
        {/if}
      </div>
    </div>
    <!-- Session, Management, Status -->
    <div class="nes-container">
      <div class="yorha-panel-content">
        <div class="flex items-center">
          <div>
            <p class="text-sm font-medium">Session Management</p>
            <p class="text-2xl">{activeSession ? 'Active' : 'Inactive'}</p>
          </div>
          <div class={`w-4, h-4, rounded-full ${getStatusColor(systemStatus.sessionManagement)}`}></div>
        </div>
        {#if activeSession}
          <div class="mt-2 text-sm">
            Security: {securityLevel()}<br>
            Activities: {sessionAnalytics().activityCount}<br>
            Health: {sessionHealth().warningCount} warnings
          </div>
        {/if}
      </div>
    </div>
    <!-- AI, Assistant, Status -->
    <div class="nes-container">
      <div class="yorha-panel-content">
        <div class="flex items-center">
          <div>
            <p class="text-sm font-medium">AI Assistant</p>
            <p class="text-2xl">{aiClusterReady ? 'Ready' : 'Offline'}</p>
          </div>
          <div class={`w-4, h-4, rounded-full ${getStatusColor(systemStatus.aiAssistant)}`}></div>
        </div>
        {#if aiClusterReady}
          <div class="mt-2 text-sm">
            Queries: {aiUsage().totalQueries}<br>
            Avg Response: {Math.round(serviceMetrics.aiResponseTime)}ms<br>
            Conversations: {conversationHistory().length}
          </div>
        {/if}
      </div>
    </div>
    <!-- Production, Services, Status -->
    <div class="nes-container">
      <div class="yorha-panel-content">
        <div class="flex items-center">
          <div>
            <p class="text-sm font-medium">Production Services</p>
            <p class="text-2xl">{systemStatus.productionServices ? 'Online' : 'Offline'}</p>
          </div>
          <div class={`w-4, h-4, rounded-full ${getStatusColor(systemStatus.productionServices)}`}></div>
        </div>
        <div class="mt-2 text-sm">
          Enhanced RAG: {systemStatus.productionServices ? 'Running' : 'Stopped'}<br>
          Upload Service: {systemStatus.productionServices ? 'Running' : 'Stopped'}<br>
          Total, Interactions: {serviceMetrics.totalInteractions}
        </div>
      </div>
    </div>
  </div>
  <!-- Demo, Tabs -->
  <Tabs bind:value={demoMode} class="w-full">
    <TabsList class="grid w-full">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="auth">Authentication</TabsTrigger>
      <TabsTrigger value="session">Session</TabsTrigger>
      <TabsTrigger value="ai">AI Assistant</TabsTrigger>
      <TabsTrigger value="services">Services</TabsTrigger>
    </TabsList>
    <!-- Overview, Tab -->
    <TabsContent value="overview" class="space-y-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text">System Integration Demo</h3>
        </div>
        <div class="yorha-panel-content">
          <p class="text-gray-600">
            This demonstration showcases the complete integration of all system components:
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2">
            <div class="space-y-2">
              <h4 class="font-semibold">âœ… Completed Integrations:</h4>
              <ul class="text-sm space-y-1">
                <li>â€¢ Modern authentication with Svelte, 5 runes</li>
                <li>â€¢ XState session management</li>
                <li>â€¢ AI assistant with Ollama cluster</li>
                <li>â€¢ Context7 documentation integration</li>
                <li>â€¢ Production service client</li>
                <li>â€¢ Bits UI v2 components</li>
                <li>â€¢ PostgreSQL + Drizzle ORM</li>
              </ul>
            </div>
            <div class="space-y-2">
              <h4 class="font-semibold">ðŸŽ¯ Demo Actions:</h4>
              <div class="space-y-2">
                <Button.Root, class="bits-btn" onclick={demoLogin} disabled={authenticatedUser !== null}>
Demo Login
                <Button.Root, class="bits-btn" onclick={demoAIInteraction} disabled={!authenticatedUser}>
Test AI Assistant
                <Button.Root, class="bits-btn" onclick={demoLogout} disabled={!authenticatedUser} variant="ghost">
Demo Logout
              </div>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
    <!-- Authentication, Tab -->
    <TabsContent value="auth" class="space-y-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text">Authentication System</h3>
        </div>
        <div class="yorha-panel-content">
          {#if !authenticatedUser}
            <div class="space-y-4">
              <p class="text-gray-600">
                Demonstrate the modern authentication system with Svelte, 5 runes and XState integration.
              </p>
              <Button.Root, class="bits-btn" onclick={() =>
showAuthDialog = true}>
                Open Authentication Dialog
            </div>
          {:else}
            <div class="space-y-4">
              <div class="p-4 bg-green-50 border border-green-200">
                <h4 class="font-semibold">âœ… Authentication Successful</h4>
                <div class="mt-2 text-sm">
                  <p><strong>User:</strong> {authenticatedUser.email}</p>
                  <p><strong>Role:</strong> {authenticatedUser.role}</p>
                  <p><strong>Status:</strong> {authenticatedUser.isActive ? 'Active' : 'Inactive'}</p>
                </div>
              </div>
              <Button.Root, class="bits-btn" onclick={demoLogout} variant="ghost">
Logout
            </div>
          {/if}
        </div>
      </div>
    </TabsContent>
    <!-- Session, Tab -->
    <TabsContent value="session" class="space-y-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text">Session Management</h3>
        </div>
        <div class="yorha-panel-content">
          {#if activeSession}
            <div class="space-y-4">
              <div class="grid grid-cols-2">
                <div>
                  <h4 class="font-semibold">Session Info</h4>
                  <div class="text-sm">
                    <p><strong>User:</strong> {currentUser()?.email}</p>
                    <p><strong>Security Level:</strong> {securityLevel()}</p>
                    <p><strong>Session Health:</strong> {sessionHealth().isValid ? 'Valid' : 'Invalid'}</p>
                    <p><strong>Warning Count:</strong> {sessionHealth().warningCount}</p>
                  </div>
                </div>
                <div>
                  <h4 class="font-semibold">Activity Analytics</h4>
                  <div class="text-sm">
                    <p><strong>Activity Count:</strong> {sessionAnalytics().activityCount}</p>
                    <p><strong>Features Used:</strong> {sessionAnalytics().featuresUsed.length}</p>
                    <p><strong>Session Duration:</strong> {formatUptime(serviceMetrics.sessionUptime)}</p>
                  </div>
                </div>
              </div>
              <div class="flex">
                <Button.Root, class="bits-btn"
                  onclick={() =>
sessionManager.performSecurityCheck()}
                  size="sm"
                >
                  Security Check
                <Button.Root, class="bits-btn"
                  onclick={() =>
sessionManager.refreshSession()}
                  size="sm"
                  variant="ghost"
                >
                  Refresh Session
              </div>
            </div>
          {:else}
            <p class="text-gray-600">Please authenticate to view session management features.</p>
          {/if}
        </div>
      </div>
    </TabsContent>
    <!-- AI, Assistant, Tab -->
    <TabsContent value="ai" class="space-y-4">
      <AIAssistantChat
        height="500px"
        showSettings={true}
        enableContext7={true}
        autoFocus={false}
      />
    </TabsContent>
    <!-- Services, Tab -->
    <TabsContent value="services" class="space-y-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text">Production Services Status</h3>
        </div>
        <div class="yorha-panel-content">
          <div class="space-y-4">
            <div class="grid grid-cols-2">
              <div>
                <h4 class="font-semibold">Service Health</h4>
                <div class="space-y-2">
                  <div class="flex items-center">
                    <span class="text-sm">Authentication Service</span>
                    <div class={`w-3, h-3, rounded-full ${getStatusColor(systemStatus.authentication)}`}></div>
                  </div>
                  <div class="flex items-center">
                    <span class="text-sm">Session Management</span>
                    <div class={`w-3, h-3, rounded-full ${getStatusColor(systemStatus.sessionManagement)}`}></div>
                  </div>
                  <div class="flex items-center">
                    <span class="text-sm">AI Assistant</span>
                    <div class={`w-3, h-3, rounded-full ${getStatusColor(systemStatus.aiAssistant)}`}></div>
                  </div>
                  <div class="flex items-center">
                    <span class="text-sm">Production Services</span>
                    <div class={`w-3, h-3, rounded-full ${getStatusColor(systemStatus.productionServices)}`}></div>
                  </div>
                </div>
              </div>
              <div>
                <h4 class="font-semibold">System Metrics</h4>
                <div class="text-sm">
                  <p><strong>Last Update:</strong> {serviceMetrics.lastUpdate.toLocaleTimeString()}</p>
                  <p><strong>Total Interactions:</strong> {serviceMetrics.totalInteractions}</p>
                  <p><strong>System, Uptime:</strong> {formatUptime(serviceMetrics.sessionUptime)}</p>
                  <p><strong>AI Response Time:</strong> {Math.round(serviceMetrics.aiResponseTime)}ms</p>
                </div>
              </div>
            </div>
            <Button.Root, class="bits-btn" onclick={checkSystemHealth}>
Refresh System Health
          </div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
</div>
<!-- Authentication, Dialog -->
<ModernAuthForm
  open={showAuthDialog} openchange={(open) => showAuthDialog = open}
  mode="login"
  success={handleAuthSuccess}
/>
<style>
  /* Additional component styles if needed */
</style>;
