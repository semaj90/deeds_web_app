<!--
  Todo List Component
  Advanced task management with Enhanced Bits UI and AI integration
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    ButtonBits,
    CardBits,
    BadgeBits,
    InputBits,
    SelectBits,
    TextareaBits,
    CheckboxBits,
    AlertBits,
    ProgressBits,
    SkeletonBits,
    SeparatorBits,
    TooltipBits,
    DialogBits,
    DropdownMenuBits
  } from '$lib/components/ui/bits-ui';
  import {
    Plus,
    Calendar,
    Clock,
    User,
    Flag,
    CheckCircle,
    Circle,
    MoreHorizontal,
    Edit3,
    Trash2,
    Brain,
    Filter,
    Search,
    RefreshCw,
    ChevronDown,
    AlertTriangle,
    Timer,
    Target,
    ListTodo
  } from 'lucide-svelte';
  import type { CaseTodo, TodoFilters } from '$lib/server/services/case-management';

  // Props
  interface Props {
    caseId?: string;
    userId?: string;
    showCaseColumn?: boolean;
    compact?: boolean;
    maxHeight?: string;
  }

  let { caseId, userId, showCaseColumn = false, compact = false, maxHeight = "600px" }: Props = $props();

  // Svelte 5 runes for state management
  let todos = $state<any[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showCreateDialog = $state(false);
  let showFilters = $state(false);

  // Filters and search
  let searchQuery = $state('');
  let statusFilter = $state<string[]>([]);
  let priorityFilter = $state<string[]>([]);
  let categoryFilter = $state<string[]>([]);
  let assignedToFilter = $state('');
  let dueDateFilter = $state<'overdue' | 'today' | 'week' | 'month' | ''>('');

  // New todo form
  let newTodo = $state({
    title: '',
    description: '',
    category: 'other',
    priority: 'medium',
    assignedToId: '',
    dueDate: '',
    estimatedHours: ''
  });

  // UI state
  let selectedTodos = $state<string[]>([]);
  let editingTodo = $state<string | null>(null);
  let sortBy = $state<'dueDate' | 'priority' | 'createdAt' | 'title'>('dueDate');
  let sortOrder = $state<'asc' | 'desc'>('asc');

  // Filter options
  const statusOptions = [
    { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Circle },
    { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: Timer },
    { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: Circle }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-800' }
  ];

  const categoryOptions = [
    { value: 'research', label: 'Research', icon: '🔍' },
    { value: 'document_review', label: 'Document Review', icon: '📄' },
    { value: 'client_communication', label: 'Client Communication', icon: '📞' },
    { value: 'court_filing', label: 'Court Filing', icon: '🏛️' },
    { value: 'investigation', label: 'Investigation', icon: '🔍' },
    { value: 'analysis', label: 'Analysis', icon: '📊' },
    { value: 'meeting', label: 'Meeting', icon: '🤝' },
    { value: 'other', label: 'Other', icon: '📋' }
  ];

  // Derived values
  const currentUserId = $derived(userId || $page.data?.user?.id || 'mock-user-id');
  const hasFilters = $derived(
    statusFilter.length > 0 ||
    priorityFilter.length > 0 ||
    categoryFilter.length > 0 ||
    searchQuery.trim() !== '' ||
    assignedToFilter !== '' ||
    dueDateFilter !== ''
  );

  const filteredTodos = $derived(() => {
    let filtered = [...todos];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(todo =>
        todo.title.toLowerCase().includes(query) ||
        todo.description?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(todo => statusFilter.includes(todo.status));
    }

    // Apply priority filter
    if (priorityFilter.length > 0) {
      filtered = filtered.filter(todo => priorityFilter.includes(todo.priority));
    }

    // Apply category filter
    if (categoryFilter.length > 0) {
      filtered = filtered.filter(todo => categoryFilter.includes(todo.category));
    }

    // Apply due date filter
    if (dueDateFilter) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(todo => {
        if (!todo.dueDate) return false;
        const dueDate = new Date(todo.dueDate);

        switch (dueDateFilter) {
          case 'overdue':
            return dueDate < today && todo.status !== 'completed';
          case 'today':
            return dueDate >= today && dueDate < tomorrow;
          case 'week':
            return dueDate >= today && dueDate < nextWeek;
          case 'month':
            return dueDate >= today && dueDate < nextMonth;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'dueDate':
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          break;
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          aValue = priorityOrder[a.priority] || 0;
          bValue = priorityOrder[b.priority] || 0;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  });

  const todoStats = $derived(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const overdue = todos.filter(t =>
      t.dueDate &&
      new Date(t.dueDate) < new Date() &&
      t.status !== 'completed'
    ).length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;

    return { total, completed, overdue, inProgress };
  });

  onMount(() => {
    loadTodos();
  });

  async function loadTodos() {
    isLoading = true;
    error = null;

    try {
      const params = new URLSearchParams();
      if (caseId) params.set('caseId', caseId);
      if (currentUserId) params.set('userId', currentUserId);

      const response = await fetch(`/api/case-management/todos?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        todos = data.todos || [];
      } else {
        throw new Error(data.error || 'Failed to load todos');
      }
    } catch (err) {
      console.error('Failed to load todos:', err);
      error = err instanceof Error ? err.message : 'Failed to load todos';
    } finally {
      isLoading = false;
    }
  }

  async function createTodo() {
    if (!newTodo.title.trim()) return;

    try {
      const todoData = {
        ...newTodo,
        caseId: caseId || null,
        createdById: currentUserId,
        assignedToId: newTodo.assignedToId || currentUserId,
        estimatedHours: newTodo.estimatedHours ? parseFloat(newTodo.estimatedHours) : null,
        dueDate: newTodo.dueDate || null
      };

      const response = await fetch('/api/case-management/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todoData)
      });

      if (!response.ok) {
        throw new Error('Failed to create todo');
      }

      const data = await response.json();

      if (data.success) {
        todos = [data.todo, ...todos];
        resetNewTodoForm();
        showCreateDialog = false;
      } else {
        throw new Error(data.error || 'Failed to create todo');
      }
    } catch (err) {
      console.error('Failed to create todo:', err);
      error = err instanceof Error ? err.message : 'Failed to create todo';
    }
  }

  async function updateTodoStatus(todoId: string, status: string) {
    try {
      const response = await fetch('/api/case-management/todos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todoId,
          updates: { status, ...(status === 'completed' && { completedAt: new Date().toISOString() }) }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update todo');
      }

      const data = await response.json();

      if (data.success) {
        todos = todos.map(t => t.id === todoId ? data.todo : t);
      }
    } catch (err) {
      console.error('Failed to update todo:', err);
      error = err instanceof Error ? err.message : 'Failed to update todo';
    }
  }

  async function deleteTodo(todoId: string) {
    if (!confirm('Are you sure you want to delete this todo?')) return;

    try {
      const response = await fetch('/api/case-management/todos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoIds: [todoId] })
      });

      if (!response.ok) {
        throw new Error('Failed to delete todo');
      }

      todos = todos.filter(t => t.id !== todoId);
    } catch (err) {
      console.error('Failed to delete todo:', err);
      error = err instanceof Error ? err.message : 'Failed to delete todo';
    }
  }

  function resetNewTodoForm() {
    newTodo = {
      title: '',
      description: '',
      category: 'other',
      priority: 'medium',
      assignedToId: '',
      dueDate: '',
      estimatedHours: ''
    };
  }

  function toggleTodoSelection(todoId: string) {
    if (selectedTodos.includes(todoId)) {
      selectedTodos = selectedTodos.filter(id => id !== todoId);
    } else {
      selectedTodos = [...selectedTodos, todoId];
    }
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = [];
    priorityFilter = [];
    categoryFilter = [];
    assignedToFilter = '';
    dueDateFilter = '';
  }

  function getStatusInfo(status: string) {
    return statusOptions.find(opt => opt.value === status) || statusOptions[0];
  }

  function getPriorityColor(priority: string): string {
    const option = priorityOptions.find(opt => opt.value === priority);
    return option?.color || 'bg-gray-100 text-gray-800';
  }

  function getCategoryInfo(category: string) {
    return categoryOptions.find(opt => opt.value === category) || categoryOptions[7];
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  function formatRelativeDate(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0) return `${diffDays} days ago`;
    return `In ${Math.abs(diffDays)} days`;
  }

  function isOverdue(dueDate: string, status: string): boolean {
    return status !== 'completed' && new Date(dueDate) < new Date();
  }
</script>

<div class="todo-list" class:compact>
  <!-- Header -->
  <div class="todo-header">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center space-x-3">
        <ListTodo class="w-6 h-6 text-blue-600" />
        <div>
          <h2 class="text-xl font-semibold text-gray-900">
            {caseId ? 'Case Tasks' : 'My Tasks'}
          </h2>
          {#if !compact}
            <div class="flex items-center space-x-4 text-sm text-gray-500 mt-1">
              <span>{todoStats.total} total</span>
              <span>{todoStats.completed} completed</span>
              {#if todoStats.overdue > 0}
                <span class="text-red-600 font-medium">{todoStats.overdue} overdue</span>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="flex items-center space-x-2">
        {#if !compact}
          <ButtonBits onclick={() => showFilters = !showFilters} variant="outline" size="sm">
            <Filter class="w-4 h-4" />
          </ButtonBits>
        {/if}

        <ButtonBits onclick={() => loadTodos()} variant="outline" size="sm">
          <RefreshCw class="w-4 h-4" />
        </ButtonBits>

        <ButtonBits onclick={() => showCreateDialog = true} size="sm">
          <Plus class="w-4 h-4 mr-2" />
          Add Task
        </ButtonBits>
      </div>
    </div>

    <!-- Progress Overview -->
    {#if !compact && todos.length > 0}
      <div class="progress-overview mb-4">
        <div class="flex items-center space-x-2 mb-2">
          <span class="text-sm text-gray-600">Overall Progress</span>
          <span class="text-sm font-medium text-gray-900">
            {Math.round((todoStats.completed / todoStats.total) * 100)}%
          </span>
        </div>
        <ProgressBits value={(todoStats.completed / todoStats.total) * 100} class="w-full" />
      </div>
    {/if}
  </div>

  <!-- Filters and Search -->
  {#if showFilters || compact}
    <CardBits class="mb-4">
      <div class="p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Search -->
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <InputBits
              bind:value={searchQuery}
              placeholder="Search tasks..."
              class="pl-10"
            />
          </div>

          <!-- Status Filter -->
          <SelectBits bind:value={statusFilter} multiple placeholder="Status">
            {#each statusOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>

          <!-- Priority Filter -->
          <SelectBits bind:value={priorityFilter} multiple placeholder="Priority">
            {#each priorityOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>

          <!-- Due Date Filter -->
          <SelectBits bind:value={dueDateFilter} placeholder="Due Date">
            <option value="">All dates</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </SelectBits>
        </div>

        {#if hasFilters}
          <div class="flex items-center justify-between mt-4">
            <BadgeBits variant="secondary" class="text-xs">
              {filteredTodos.length} of {todos.length} tasks
            </BadgeBits>
            <ButtonBits onclick={clearFilters} variant="outline" size="sm">
              Clear Filters
            </ButtonBits>
          </div>
        {/if}
      </div>
    </CardBits>
  {/if}

  <!-- Todo List -->
  <div class="todo-list-container" style="max-height: {maxHeight}; overflow-y: auto;">
    {#if error}
      <AlertBits variant="destructive" class="mb-4">
        <AlertTriangle class="w-4 h-4" />
        <div class="ml-2">
          <h3 class="font-semibold">Error loading tasks</h3>
          <p class="text-sm mt-1">{error}</p>
          <ButtonBits onclick={() => loadTodos()} variant="outline" size="sm" class="mt-2">
            <RefreshCw class="w-4 h-4 mr-2" />
            Retry
          </ButtonBits>
        </div>
      </AlertBits>
    {:else if isLoading}
      <div class="space-y-3">
        {#each Array(5) as _}
          <CardBits class="p-4">
            <div class="flex items-center space-x-3">
              <SkeletonBits class="h-4 w-4 rounded" />
              <SkeletonBits class="h-4 flex-1" />
              <SkeletonBits class="h-4 w-16" />
            </div>
          </CardBits>
        {/each}
      </div>
    {:else if filteredTodos.length === 0}
      <CardBits class="p-12 text-center">
        <div class="text-6xl mb-4">📝</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          {hasFilters ? 'No tasks match your filters' : 'No tasks yet'}
        </h3>
        <p class="text-gray-500 mb-4">
          {hasFilters ? 'Try adjusting your search or filters.' : 'Create your first task to get started.'}
        </p>
        {#if hasFilters}
          <ButtonBits onclick={clearFilters} variant="outline">
            Clear Filters
          </ButtonBits>
        {:else}
          <ButtonBits onclick={() => showCreateDialog = true}>
            <Plus class="w-4 h-4 mr-2" />
            Create First Task
          </ButtonBits>
        {/if}
      </CardBits>
    {:else}
      <div class="space-y-3">
        {#each filteredTodos as todo (todo.id)}
          {@const statusInfo = getStatusInfo(todo.status)}
          {@const categoryInfo = getCategoryInfo(todo.category)}
          {@const isTaskOverdue = todo.dueDate && isOverdue(todo.dueDate, todo.status)}

          <CardBits class="todo-item hover:shadow-md transition-all duration-200" class:overdue={isTaskOverdue}>
            <div class="p-4">
              <div class="flex items-start space-x-3">
                <!-- Checkbox -->
                <div class="flex-shrink-0 mt-1">
                  <CheckboxBits
                    checked={todo.status === 'completed'}
                    onchange={() => updateTodoStatus(
                      todo.id,
                      todo.status === 'completed' ? 'pending' : 'completed'
                    )}
                    class="w-5 h-5"
                  />
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <h4 class="text-sm font-medium text-gray-900 mb-1" class:line-through={todo.status === 'completed'}>
                        {todo.title}
                      </h4>

                      {#if todo.description}
                        <p class="text-sm text-gray-600 mb-2" class:line-through={todo.status === 'completed'}>
                          {todo.description}
                        </p>
                      {/if}

                      <!-- Meta information -->
                      <div class="flex items-center space-x-4 text-xs">
                        <!-- Category -->
                        <div class="flex items-center space-x-1">
                          <span>{categoryInfo.icon}</span>
                          <span class="text-gray-500">{categoryInfo.label}</span>
                        </div>

                        <!-- Priority -->
                        <BadgeBits variant="outline" class={getPriorityColor(todo.priority)} size="sm">
                          <Flag class="w-3 h-3 mr-1" />
                          {todo.priority}
                        </BadgeBits>

                        <!-- Due date -->
                        {#if todo.dueDate}
                          <div class="flex items-center space-x-1" class:text-red-600={isTaskOverdue}>
                            <Calendar class="w-3 h-3" />
                            <span>{formatRelativeDate(todo.dueDate)}</span>
                          </div>
                        {/if}

                        <!-- Estimated time -->
                        {#if todo.estimatedHours}
                          <div class="flex items-center space-x-1">
                            <Clock class="w-3 h-3" />
                            <span class="text-gray-500">{todo.estimatedHours}h</span>
                          </div>
                        {/if}

                        <!-- AI generated badge -->
                        {#if todo.aiGenerated}
                          <BadgeBits variant="secondary" class="bg-purple-100 text-purple-800" size="sm">
                            <Brain class="w-3 h-3 mr-1" />
                            AI
                          </BadgeBits>
                        {/if}
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center space-x-2">
                      <!-- Status badge -->
                      <BadgeBits variant="outline" class={statusInfo.color} size="sm">
                        <statusInfo.icon class="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </BadgeBits>

                      <!-- More actions -->
                      <DropdownMenuBits>
                        <ButtonBits variant="ghost" size="sm" class="h-8 w-8 p-0">
                          <MoreHorizontal class="w-4 h-4" />
                        </ButtonBits>
                        <div slot="content" class="w-40">
                          <button
                            class="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                            onclick={() => editingTodo = todo.id}
                          >
                            <Edit3 class="w-4 h-4 mr-2" />
                            Edit Task
                          </button>
                          <SeparatorBits />
                          <button
                            class="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-100 rounded text-red-600"
                            onclick={() => deleteTodo(todo.id)}
                          >
                            <Trash2 class="w-4 h-4 mr-2" />
                            Delete
                          </button>
                        </div>
                      </DropdownMenuBits>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardBits>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Create Todo Dialog -->
  <DialogBits bind:open={showCreateDialog}>
    <div slot="content" class="max-w-2xl">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Create New Task</h3>

        <div class="space-y-4">
          <!-- Title -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <InputBits
              bind:value={newTodo.title}
              placeholder="Enter task title..."
              class="w-full"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <TextareaBits
              bind:value={newTodo.description}
              placeholder="Enter task description..."
              rows="3"
              class="w-full"
            />
          </div>

          <!-- Category and Priority -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <SelectBits bind:value={newTodo.category} class="w-full">
                {#each categoryOptions as option}
                  <option value={option.value}>{option.icon} {option.label}</option>
                {/each}
              </SelectBits>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <SelectBits bind:value={newTodo.priority} class="w-full">
                {#each priorityOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </SelectBits>
            </div>
          </div>

          <!-- Due Date and Estimated Hours -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <InputBits
                type="date"
                bind:value={newTodo.dueDate}
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Estimated Hours
              </label>
              <InputBits
                type="number"
                step="0.5"
                min="0"
                bind:value={newTodo.estimatedHours}
                placeholder="0.0"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- Dialog Actions -->
        <div class="flex items-center justify-end space-x-3 mt-6 pt-4 border-t">
          <ButtonBits
            onclick={() => {
              showCreateDialog = false;
              resetNewTodoForm();
            }}
            variant="outline"
          >
            Cancel
          </ButtonBits>
          <ButtonBits
            onclick={createTodo}
            disabled={!newTodo.title.trim()}
          >
            <Plus class="w-4 h-4 mr-2" />
            Create Task
          </ButtonBits>
        </div>
      </div>
    </div>
  </DialogBits>
</div>

<style>
  .todo-list {
    @apply w-full;
  }

  .todo-list.compact {
    @apply max-w-md;
  }

  .todo-item.overdue {
    @apply border-l-4 border-l-red-500 bg-red-50;
  }

  .todo-list-container {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 #f1f5f9;
  }

  .todo-list-container::-webkit-scrollbar {
    width: 6px;
  }

  .todo-list-container::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 3px;
  }

  .todo-list-container::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .todo-list-container::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
</style>


