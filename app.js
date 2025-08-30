// Database version and name management
const DB_NAME = 'TodoDB';
const DB_VERSION = 2;

// Global variables
let db;
let tasks = [];
let archivedTasks = [];
let selectedPriority = 'medium';
let recentlyDeletedTask = null;
let undoTimeoutId = null;
let currentlyEditingTask = null;
let importErrorTimeoutId = null;

// DOM Elements
const taskInput = document.getElementById('taskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskList = document.getElementById('taskList');
const taskCount = document.getElementById('taskCount');
const archiveCompletedBtn = document.getElementById('archiveCompletedBtn');
const emptyState = document.getElementById('emptyState');
const darkModeToggle = document.getElementById('darkModeToggle');
const archivedTaskList = document.getElementById('archivedTaskList');
const emptyArchivedState = document.getElementById('emptyArchivedState');
const toggleArchivedTasksBtn = document.getElementById('toggleArchivedTasksBtn');
const deleteArchivedBtn = document.getElementById('deleteArchivedBtn');
const importFile = document.getElementById('importFile');
const exportBtn = document.getElementById('exportBtn');
const undoNotification = document.getElementById('undoNotification');
const undoDeleteBtn = document.getElementById('undoDeleteBtn');
const closeNotificationBtn = document.getElementById('closeNotificationBtn');
const editTaskModal = document.getElementById('editTaskModal');
const editTaskInput = document.getElementById('editTaskInput');
const closeEditModalBtn = document.getElementById('closeEditModalBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveEditBtn = document.getElementById('saveEditBtn');
const importErrorNotification = document.getElementById('importErrorNotification');
const importErrorText = document.getElementById('importErrorText');
const closeImportErrorBtn = document.getElementById('closeImportErrorBtn');

let showArchivedTasks = false;

// Database migration functions
async function migrateExistingDatabase() {
    try {
        if (!indexedDB.databases) {
            return; // Some browsers don't support this API
        }
        
        const databases = await indexedDB.databases();
        const existingDb = databases.find(db => db.name.includes('TodoDB') && db.name !== DB_NAME);
        
        if (existingDb) {
            console.log('Migrating data from old database:', existingDb.name);
            await copyDatabaseData(existingDb.name, DB_NAME);
            indexedDB.deleteDatabase(existingDb.name);
        }
    } catch (error) {
        console.log('Migration not supported or not needed:', error);
    }
}

async function copyDatabaseData(oldDbName, newDbName) {
    return new Promise((resolve, reject) => {
        const oldRequest = indexedDB.open(oldDbName);
        
        oldRequest.onsuccess = function(event) {
            const oldDB = event.target.result;
            
            const newRequest = indexedDB.open(newDbName, DB_VERSION);
            
            newRequest.onupgradeneeded = function(event) {
                const newDB = event.target.result;
                
                if (!newDB.objectStoreNames.contains('tasks')) {
                    const tasksStore = newDB.createObjectStore('tasks', { 
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    tasksStore.createIndex('completed', 'completed', { unique: false });
                    tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
                    tasksStore.createIndex('priority', 'priority', { unique: false });
                }
                
                if (!newDB.objectStoreNames.contains('archivedTasks')) {
                    const archivedStore = newDB.createObjectStore('archivedTasks', { 
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    archivedStore.createIndex('archivedAt', 'archivedAt', { unique: false });
                }
            };
            
            newRequest.onsuccess = function(event) {
                const newDB = event.target.result;
                
                // Copy tasks
                if (oldDB.objectStoreNames.contains('tasks')) {
                    const oldTransaction = oldDB.transaction(['tasks'], 'readonly');
                    const oldStore = oldTransaction.objectStore('tasks');
                    const taskRequest = oldStore.getAll();
                    
                    taskRequest.onsuccess = async function() {
                        const tasks = taskRequest.result;
                        if (tasks.length > 0) {
                            const newTransaction = newDB.transaction(['tasks'], 'readwrite');
                            const newStore = newTransaction.objectStore('tasks');
                            
                            for (const task of tasks) {
                                newStore.add(task);
                            }
                            
                            await newTransaction.complete;
                        }
                        
                        // Copy archived tasks
                        if (oldDB.objectStoreNames.contains('archivedTasks')) {
                            const oldArchivedTransaction = oldDB.transaction(['archivedTasks'], 'readonly');
                            const oldArchivedStore = oldArchivedTransaction.objectStore('archivedTasks');
                            const archivedRequest = oldArchivedStore.getAll();
                            
                            archivedRequest.onsuccess = async function() {
                                const archivedTasks = archivedRequest.result;
                                if (archivedTasks.length > 0) {
                                    const newArchivedTransaction = newDB.transaction(['archivedTasks'], 'readwrite');
                                    const newArchivedStore = newArchivedTransaction.objectStore('archivedTasks');
                                    
                                    for (const task of archivedTasks) {
                                        newArchivedStore.add(task);
                                    }
                                    
                                    await newArchivedTransaction.complete;
                                }
                                resolve();
                            };
                        } else {
                            resolve();
                        }
                    };
                } else {
                    resolve();
                }
            };
            
            newRequest.onerror = reject;
        };
        
        oldRequest.onerror = reject;
    });
}

// Initialize IndexedDB with migration support
async function initializeDatabase() {
    try {
        await migrateExistingDatabase();
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = function(event) {
            console.error("Database error:", event.target.error);
            tryRestoreFromBackup();
        };
        
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('tasks')) {
                const tasksStore = db.createObjectStore('tasks', { 
                    keyPath: 'id',
                    autoIncrement: false
                });
                
                tasksStore.createIndex('completed', 'completed', { unique: false });
                tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
                tasksStore.createIndex('priority', 'priority', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('archivedTasks')) {
                const archivedStore = db.createObjectStore('archivedTasks', { 
                    keyPath: 'id',
                    autoIncrement: false
                });
                
                archivedStore.createIndex('archivedAt', 'archivedAt', { unique: false });
            }
        };
        
        request.onsuccess = function(event) {
            db = event.target.result;
            getAllTasks();
            getAllArchivedTasks();
        };
        
    } catch (error) {
        console.error("Database initialization failed:", error);
        tryRestoreFromBackup();
    }
}

// Backup and restore functions
function backupToLocalStorage() {
    localStorage.setItem('todo_backup', JSON.stringify({
        tasks: tasks,
        archivedTasks: archivedTasks,
        timestamp: new Date().toISOString(),
        version: DB_VERSION
    }));
}

function tryRestoreFromBackup() {
    const backup = localStorage.getItem('todo_backup');
    if (backup) {
        try {
            const data = JSON.parse(backup);
            if (data.tasks && data.archivedTasks) {
                tasks = data.tasks;
                archivedTasks = data.archivedTasks;
                renderTasks();
                renderArchivedTasks();
                console.log('Restored from backup');
            }
        } catch (error) {
            console.error("Backup restore failed:", error);
        }
    }
}

// Undo functionality
function showUndoNotification() {
    // Clear any existing timeout
    if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
    }
    
    // Show the notification
    undoNotification.classList.remove('hidden');
    undoNotification.classList.add('flex');
    
    // Set a timeout to automatically hide the notification
    undoTimeoutId = setTimeout(() => {
        hideUndoNotification();
        recentlyDeletedTask = null;
    }, 5000);
}

function hideUndoNotification() {
    undoNotification.classList.add('hidden');
    undoNotification.classList.remove('flex');
    
    if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
        undoTimeoutId = null;
    }
}

function undoDelete() {
    if (!recentlyDeletedTask) return;
    
    const transaction = db.transaction(['tasks'], 'readwrite');
    const objectStore = transaction.objectStore('tasks');
    const request = objectStore.add(recentlyDeletedTask);
    
    request.onsuccess = function() {
        recentlyDeletedTask = null;
        hideUndoNotification();
        getAllTasks();
    };
    
    request.onerror = function() {
        console.error("Failed to undo delete");
        hideUndoNotification();
    };
}

// Import error notification
function showImportError(message) {
    // Clear any existing timeout
    if (importErrorTimeoutId) {
        clearTimeout(importErrorTimeoutId);
    }
    
    // Set error message
    importErrorText.textContent = message || 'Invalid import file format';
    
    // Show the notification
    importErrorNotification.classList.remove('hidden');
    importErrorNotification.classList.add('flex');
    
    // Set a timeout to automatically hide the notification
    importErrorTimeoutId = setTimeout(() => {
        hideImportError();
    }, 5000);
}

function hideImportError() {
    importErrorNotification.classList.add('hidden');
    importErrorNotification.classList.remove('flex');
    
    if (importErrorTimeoutId) {
        clearTimeout(importErrorTimeoutId);
        importErrorTimeoutId = null;
    }
}

// Data validation functions
function isValidTask(task) {
    // Basic validation
    if (!task || typeof task !== 'object') return false;
    
    // Check required fields
    if (typeof task.id !== 'number' || task.id <= 0) return false;
    if (typeof task.text !== 'string' || task.text.trim() === '') return false;
    if (typeof task.completed !== 'boolean') return false;
    if (typeof task.createdAt !== 'string' || isNaN(Date.parse(task.createdAt))) return false;
    if (!['high', 'medium', 'low'].includes(task.priority)) return false;
    
    // Check optional fields
    if (task.category && typeof task.category !== 'string') return false;
    if (task.archivedAt && (typeof task.archivedAt !== 'string' || isNaN(Date.parse(task.archivedAt)))) return false;
    
    // Check for unexpected properties
    const allowedProperties = ['id', 'text', 'completed', 'createdAt', 'priority', 'category', 'archivedAt'];
    const taskProperties = Object.keys(task);
    return taskProperties.every(prop => allowedProperties.includes(prop));
}

function isValidImportData(data) {
    // Basic validation
    if (!data || typeof data !== 'object') return false;
    
    // Check if data has tasks and archivedTasks arrays
    if (!Array.isArray(data.tasks) || !Array.isArray(data.archivedTasks)) return false;
    
    // Validate all tasks
    const allTasksValid = data.tasks.every(isValidTask) && data.archivedTasks.every(isValidTask);
    
    return allTasksValid;
}

// Task editing functionality
function openEditModal(task) {
    currentlyEditingTask = task;
    editTaskInput.value = task.text;
    
    // Set the priority buttons
    document.querySelectorAll('.edit-priority-btn').forEach(btn => {
        btn.classList.remove(
            'bg-red-500', 'text-white', 'dark:bg-red-600',
            'bg-yellow-500', 'dark:bg-yellow-600',
            'bg-green-500', 'dark:bg-green-600'
        );
        btn.classList.add(
            'bg-white', 'dark:bg-dark-800'
        );
        
        const isDarkMode = document.documentElement.classList.contains('dark');
        btn.classList.toggle('text-white', isDarkMode);
        btn.classList.toggle('text-black', !isDarkMode);
        
        if (btn.dataset.priority === task.priority) {
            if (btn.dataset.priority === 'high') {
                btn.classList.add('bg-red-500', 'dark:bg-red-600', 'text-white');
            } else if (btn.dataset.priority === 'medium') {
                btn.classList.add('bg-yellow-500', 'dark:bg-yellow-600', 'text-white');
            } else {
                btn.classList.add('bg-green-500', 'dark:bg-green-600', 'text-white');
            }
        }
    });
    
    editTaskModal.classList.remove('hidden');
    editTaskInput.focus();
}

function closeEditModal() {
    editTaskModal.classList.add('hidden');
    currentlyEditingTask = null;
}

function saveTaskEdit() {
    if (!currentlyEditingTask) return;
    
    const newText = editTaskInput.value.trim();
    if (newText === '') return;
    
    // Get selected priority from edit modal
    const selectedPriorityBtn = document.querySelector('.edit-priority-btn.bg-red-500, .edit-priority-btn.bg-yellow-500, .edit-priority-btn.bg-green-500');
    const newPriority = selectedPriorityBtn ? selectedPriorityBtn.dataset.priority : currentlyEditingTask.priority;
    
    const updatedTask = {
        ...currentlyEditingTask,
        text: newText,
        priority: newPriority
    };
    
    const transaction = db.transaction(['tasks'], 'readwrite');
    const objectStore = transaction.objectStore('tasks');
    const request = objectStore.put(updatedTask);
    
    request.onsuccess = function() {
        closeEditModal();
        getAllTasks();
    };
    
    request.onerror = function() {
        console.error("Failed to update task");
        alert("Failed to update task. Please try again.");
    };
}

// Main initialization
document.addEventListener('DOMContentLoaded', async function() {
    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true' || 
        (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    
    // Initialize database
    await initializeDatabase();
    
    // Set up event listeners
    setupEventListeners();
    
    // Create backup every 30 seconds and on page unload
    setInterval(backupToLocalStorage, 30000);
    window.addEventListener('beforeunload', backupToLocalStorage);
});

function setupEventListeners() {
    // Dark mode toggle
    darkModeToggle.addEventListener('click', function() {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
        updatePriorityButtonTextColors();
    });
    
    // Toggle archived tasks visibility
    toggleArchivedTasksBtn.addEventListener('click', function() {
        showArchivedTasks = !showArchivedTasks;
        archivedTaskList.classList.toggle('hidden', !showArchivedTasks);
        this.textContent = showArchivedTasks ? 'Hide' : 'Show';
        
        // Also toggle footer visibility
        const archivedTasksFooter = document.getElementById('archivedTasksFooter');
        if (archivedTasks.length > 0 && showArchivedTasks) {
            archivedTasksFooter.classList.remove('hidden');
        } else {
            archivedTasksFooter.classList.add('hidden');
        }
    });
    
    // Delete all archived tasks
    deleteArchivedBtn.addEventListener('click', deleteAllArchivedTasks);
    
    // Priority button selection
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.priority-btn').forEach(b => {
                b.classList.remove(
                    'bg-red-500', 'text-white', 'dark:bg-red-600',
                    'bg-yellow-500', 'dark:bg-yellow-600',
                    'bg-green-500', 'dark:bg-green-600'
                );
                b.classList.add(
                    'bg-white', 'dark:bg-dark-800'
                );
                
                const isDarkMode = document.documentElement.classList.contains('dark');
                b.classList.toggle('text-white', isDarkMode);
                b.classList.toggle('text-black', !isDarkMode);
            });
            
            if (this.dataset.priority === 'high') {
                this.classList.add('bg-red-500', 'dark:bg-red-600', 'text-white');
            } else if (this.dataset.priority === 'medium') {
                this.classList.add('bg-yellow-500', 'dark:bg-yellow-600', 'text-white');
            } else {
                this.classList.add('bg-green-500', 'dark:bg-green-600', 'text-white');
            }
            
            selectedPriority = this.dataset.priority;
        });
    });
    
    // Edit modal priority buttons
    document.querySelectorAll('.edit-priority-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.edit-priority-btn').forEach(b => {
                b.classList.remove(
                    'bg-red-500', 'text-white', 'dark:bg-red-600',
                    'bg-yellow-500', 'dark:bg-yellow-600',
                    'bg-green-500', 'dark:bg-green-600'
                );
                b.classList.add(
                    'bg-white', 'dark:bg-dark-800'
                );
                
                const isDarkMode = document.documentElement.classList.contains('dark');
                b.classList.toggle('text-white', isDarkMode);
                b.classList.toggle('text-black', !isDarkMode);
            });
            
            if (this.dataset.priority === 'high') {
                this.classList.add('bg-red-500', 'dark:bg-red-600', 'text-white');
            } else if (this.dataset.priority === 'medium') {
                this.classList.add('bg-yellow-500', 'dark:bg-yellow-600', 'text-white');
            } else {
                this.classList.add('bg-green-500', 'dark:bg-green-600', 'text-white');
            }
        });
    });
    
    // Set medium as default selected for add task
    document.querySelector('.priority-btn[data-priority="medium"]').click();
    
    // Add task
    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addTask();
        }
    });
    
    // Archive completed tasks
    archiveCompletedBtn.addEventListener('click', archiveCompletedTasks);
    
    // Import/Export
    importFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check file size (max 1MB)
        if (file.size > 1024 * 1024) {
            showImportError('File too large. Maximum size is 1MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                // Parse the JSON file
                const data = JSON.parse(e.target.result);
                
                // Validate the imported data
                if (!isValidImportData(data)) {
                    showImportError('Invalid file format. Please use a valid export file.');
                    return;
                }
                
                if (confirm(`Import ${data.tasks.length} active tasks and ${data.archivedTasks.length} archived tasks? This will replace your current tasks.`)) {
                    importTasks(data.tasks, data.archivedTasks);
                }
            } catch (error) {
                console.error('Import error:', error);
                showImportError('Error parsing file. Please use a valid JSON file.');
            }
        };
        
        reader.onerror = function() {
            showImportError('Error reading file. Please try again.');
        };
        
        reader.readAsText(file);
    });
    
    exportBtn.addEventListener('click', exportTasks);
    
    // Undo functionality
    undoDeleteBtn.addEventListener('click', undoDelete);
    closeNotificationBtn.addEventListener('click', hideUndoNotification);
    
    // Import error functionality
    closeImportErrorBtn.addEventListener('click', hideImportError);
    
    // Edit modal functionality
    closeEditModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);
    saveEditBtn.addEventListener('click', saveTaskEdit);
    
    // Close modal when clicking outside
    editTaskModal.addEventListener('click', function(e) {
        if (e.target === editTaskModal) {
            closeEditModal();
        }
    });
    
    // Allow Enter key to save in edit modal
    editTaskInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveTaskEdit();
        }
    });
    
    // Event delegation for dynamic elements
    taskList.addEventListener('click', function(e) {
        const taskElement = e.target.closest('[data-id]');
        if (!taskElement) return;
        
        const taskId = parseInt(taskElement.dataset.id);
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (e.target.closest('.complete-btn')) {
            const updatedTask = {...task, completed: !task.completed};
            
            const transaction = db.transaction(['tasks'], 'readwrite');
            const objectStore = transaction.objectStore('tasks');
            const request = objectStore.put(updatedTask);
            
            request.onsuccess = function() {
                getAllTasks();
            };
        }
        
        if (e.target.closest('.delete-btn')) {
            // Store the task for possible undo
            recentlyDeletedTask = task;
            
            const transaction = db.transaction(['tasks'], 'readwrite');
            const objectStore = transaction.objectStore('tasks');
            const request = objectStore.delete(taskId);
            
            request.onsuccess = function() {
                getAllTasks();
                showUndoNotification();
            };
        }
        
        if (e.target.closest('.edit-btn')) {
            openEditModal(task);
        }
    });
    
    archivedTaskList.addEventListener('click', function(e) {
        const taskElement = e.target.closest('[data-id]');
        if (!taskElement) return;
        
        const taskId = parseInt(taskElement.dataset.id);
        
        if (e.target.closest('.delete-archived-btn')) {
            const transaction = db.transaction(['archivedTasks'], 'readwrite');
            const objectStore = transaction.objectStore('archivedTasks');
            const request = objectStore.delete(taskId);
            
            request.onsuccess = function() {
                getAllArchivedTasks();
            };
        }
    });
    
    // Touch feedback for mobile
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('touchstart', function() {
            this.classList.add('opacity-80');
        });
        
        button.addEventListener('touchend', function() {
            this.classList.remove('opacity-80');
        });
    });
    
    updatePriorityButtonTextColors();
}

function updatePriorityButtonTextColors() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.priority-btn').forEach(btn => {
        if (btn.classList.contains('bg-red-500') || btn.classList.contains('bg-yellow-500') || btn.classList.contains('bg-green-500')) {
            btn.classList.add('text-white');
            btn.classList.remove('text-black');
        } else {
            btn.classList.toggle('text-white', isDarkMode);
            btn.classList.toggle('text-black', !isDarkMode);
        }
    });
    
    document.querySelectorAll('.edit-priority-btn').forEach(btn => {
        if (btn.classList.contains('bg-red-500') || btn.classList.contains('bg-yellow-500') || btn.classList.contains('bg-green-500')) {
            btn.classList.add('text-white');
            btn.classList.remove('text-black');
        } else {
            btn.classList.toggle('text-white', isDarkMode);
            btn.classList.toggle('text-black', !isDarkMode);
        }
    });
}

// Database operations
function getAllTasks() {
    const transaction = db.transaction(['tasks'], 'readonly');
    const objectStore = transaction.objectStore('tasks');
    const request = objectStore.getAll();
    
    request.onsuccess = function(event) {
        tasks = event.target.result || [];
        renderTasks();
        backupToLocalStorage();
    };
}

function getAllArchivedTasks() {
    const transaction = db.transaction(['archivedTasks'], 'readonly');
    const objectStore = transaction.objectStore('archivedTasks');
    const request = objectStore.getAll();
    
    request.onsuccess = function(event) {
        archivedTasks = event.target.result || [];
        renderArchivedTasks();
        deleteArchivedBtn.disabled = archivedTasks.length === 0;
        
        // Show/hide footer based on whether there are archived tasks
        const archivedTasksFooter = document.getElementById('archivedTasksFooter');
        if (archivedTasks.length > 0 && showArchivedTasks) {
            archivedTasksFooter.classList.remove('hidden');
        } else {
            archivedTasksFooter.classList.add('hidden');
        }
        
        backupToLocalStorage();
    };
}

function addTask() {
    const taskText = taskInput.value.trim();
    if (taskText === '') return;
    
    const newTask = {
        id: Date.now(),
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        priority: selectedPriority,
        category: 'general'
    };
    
    const transaction = db.transaction(['tasks'], 'readwrite');
    const objectStore = transaction.objectStore('tasks');
    const request = objectStore.add(newTask);
    
    request.onsuccess = function() {
        taskInput.value = '';
        taskInput.focus();
        getAllTasks();
    };
}

function archiveCompletedTasks() {
    const completedTasks = tasks.filter(task => task.completed);
    if (completedTasks.length === 0) return;
    
    const tasksTransaction = db.transaction(['tasks'], 'readwrite');
    const tasksStore = tasksTransaction.objectStore('tasks');
    
    const archiveTransaction = db.transaction(['archivedTasks'], 'readwrite');
    const archiveStore = archiveTransaction.objectStore('archivedTasks');
    
    completedTasks.forEach(task => {
        const archivedTask = {
            ...task,
            archivedAt: new Date().toISOString()
        };
        archiveStore.add(archivedTask);
        tasksStore.delete(task.id);
    });
    
    tasksTransaction.oncomplete = function() {
        getAllTasks();
    };
    
    archiveTransaction.oncomplete = function() {
        getAllArchivedTasks();
        if (!showArchivedTasks) {
            showArchivedTasks = true;
            archivedTaskList.classList.remove('hidden');
            toggleArchivedTasksBtn.textContent = 'Hide';
        }
    };
}

function deleteAllArchivedTasks() {
    if (archivedTasks.length === 0) return;
    
    if (!confirm('Are you sure you want to delete all archived tasks? This action cannot be undone.')) {
        return;
    }
    
    const transaction = db.transaction(['archivedTasks'], 'readwrite');
    const objectStore = transaction.objectStore('archivedTasks');
    
    archivedTasks.forEach(task => {
        objectStore.delete(task.id);
    });
    
    transaction.oncomplete = function() {
        getAllArchivedTasks();
    };
}

function importTasks(newTasks, newArchivedTasks) {
    const tasksTransaction = db.transaction(['tasks'], 'readwrite');
    const tasksStore = tasksTransaction.objectStore('tasks');
    
    const archiveTransaction = db.transaction(['archivedTasks'], 'readwrite');
    const archiveStore = archiveTransaction.objectStore('archivedTasks');
    
    // Clear existing data
    tasksStore.clear();
    archiveStore.clear();
    
    // Add new tasks with validation
    newTasks.forEach(task => {
        if (isValidTask(task)) {
            tasksStore.add(task);
        }
    });
    
    // Add new archived tasks with validation
    newArchivedTasks.forEach(task => {
        if (isValidTask(task)) {
            archiveStore.add(task);
        }
    });
    
    tasksTransaction.oncomplete = function() {
        getAllTasks();
    };
    
    archiveTransaction.oncomplete = function() {
        getAllArchivedTasks();
        alert(`Successfully imported ${newTasks.length} active tasks and ${newArchivedTasks.length} archived tasks`);
    };
}

function exportTasks() {
    const tasksTransaction = db.transaction(['tasks'], 'readonly');
    const tasksStore = tasksTransaction.objectStore('tasks');
    const tasksRequest = tasksStore.getAll();
    
    const archiveTransaction = db.transaction(['archivedTasks'], 'readonly');
    const archiveStore = archiveTransaction.objectStore('archivedTasks');
    const archiveRequest = archiveStore.getAll();
    
    Promise.all([
        new Promise(resolve => {
            tasksRequest.onsuccess = () => resolve(tasksRequest.result);
            tasksRequest.onerror = () => resolve([]);
        }),
        new Promise(resolve => {
            archiveRequest.onsuccess = () => resolve(archiveRequest.result);
            archiveRequest.onerror = () => resolve([]);
        })
    ]).then(([tasks, archivedTasks]) => {
        const data = {
            tasks: tasks,
            archivedTasks: archivedTasks,
            exportedAt: new Date().toISOString(),
            version: DB_VERSION
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-app-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// Rendering functions
function renderTasks() {
    if (tasks.length === 0) {
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
    }
    
    taskList.innerHTML = '';
    
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    sortedTasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `px-6 py-4 flex items-start ${task.completed ? 'bg-gray-50 dark:bg-dark-600' : ''}`;
        taskElement.dataset.id = task.id;
        
        let priorityColor = 'bg-gray-500';
        let priorityText = task.priority;
        if (task.priority === 'high') {
            priorityColor = 'bg-red-500 dark:bg-red-600';
            priorityText = 'High';
        } else if (task.priority === 'medium') {
            priorityColor = 'bg-yellow-500 dark:bg-yellow-600';
            priorityText = 'Medium';
        } else {
            priorityColor = 'bg-green-500 dark:bg-green-600';
            priorityText = 'Low';
        }
        
        taskElement.innerHTML = `
            <div class="flex-shrink-0 pt-1 mr-4">
                <button class="complete-btn w-6 h-6 rounded-full border-2 ${task.completed ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-dark-500'} flex items-center justify-center">
                    ${task.completed ? '<i class="fas fa-check text-xs"></i>' : ''}
                </button>
            </div>
            <div class="flex-grow min-w-0">
                <div class="${task.completed ? 'line-through text-gray-500 dark:text-dark-400' : 'text-gray-800 dark:text-dark-100'} break-words">${task.text}</div>
                <div class="flex items-center mt-1">
                    <span class="text-xs px-2 py-1 rounded-full ${priorityColor} text-white mr-2">${priorityText}</span>
                    <span class="text-xs text-gray-500 dark:text-dark-400">${new Date(task.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="flex flex-shrink-0 space-x-2">
                <button class="edit-btn text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        taskList.appendChild(taskElement);
    });
    
    updateTaskCount();
}

function renderArchivedTasks() {
    if (archivedTasks.length === 0) {
        emptyArchivedState.style.display = 'block';
        const archivedTasksFooter = document.getElementById('archivedTasksFooter');
        archivedTasksFooter.classList.add('hidden');
    } else {
        emptyArchivedState.style.display = 'none';
    }
    
    archivedTaskList.innerHTML = '';
    
    const sortedArchivedTasks = [...archivedTasks].sort((a, b) => 
        new Date(b.archivedAt) - new Date(a.archivedAt)
    );
    
    sortedArchivedTasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = 'px-6 py-4 flex items-start bg-gray-50 dark:bg-dark-600';
        taskElement.dataset.id = task.id;
        
        let priorityColor = 'bg-gray-500';
        let priorityText = task.priority;
        if (task.priority === 'high') {
            priorityColor = 'bg-red-500 dark:bg-red-600';
            priorityText = 'High';
        } else if (task.priority === 'medium') {
            priorityColor = 'bg-yellow-500 dark:bg-yellow-600';
            priorityText = 'Medium';
        } else {
            priorityColor = 'bg-green-500 dark:bg-green-600';
            priorityText = 'Low';
        }
        
        taskElement.innerHTML = `
            <div class="flex-shrink-0 pt-1 mr-4">
                <div class="w-6 h-6 flex items-center justify-center text-gray-400">
                    <i class="fas fa-archive"></i>
                </div>
            </div>
            <div class="flex-grow min-w-0">
                <div class="line-through text-gray-500 dark:text-dark-400 break-words">${task.text}</div>
                <div class="flex items-center mt-1">
                    <span class="text-xs px-2 py-1 rounded-full ${priorityColor} text-white mr-2">${priorityText}</span>
                    <span class="text-xs text-gray-500 dark:text-dark-400">Archived: ${new Date(task.archivedAt).toLocaleDateString()}</span>
                </div>
            </div>
            <button class="delete-archived-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-2 flex-shrink-0">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        archivedTaskList.appendChild(taskElement);
    });
    
    // Update footer visibility
    const archivedTasksFooter = document.getElementById('archivedTasksFooter');
    if (archivedTasks.length > 0 && showArchivedTasks) {
        archivedTasksFooter.classList.remove('hidden');
    } else {
        archivedTasksFooter.classList.add('hidden');
    }
}

function updateTaskCount() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.completed).length;
    
    taskCount.textContent = `${completedTasks} of ${totalTasks} tasks completed`;
    archiveCompletedBtn.disabled = completedTasks === 0;
}