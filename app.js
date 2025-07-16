document.addEventListener('DOMContentLoaded', function() {
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
    
    let db;
    let tasks = [];
    let archivedTasks = [];
    let selectedPriority = 'medium'; // Default priority
    let showArchivedTasks = false;
    
    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true' || 
        (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    
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
    });
    
    // Delete all archived tasks
    deleteArchivedBtn.addEventListener('click', deleteAllArchivedTasks);
    
    // Import tasks
    importFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.tasks || !data.archivedTasks) {
                    throw new Error("Invalid file format");
                }
                
                if (confirm(`Import ${data.tasks.length} active tasks and ${data.archivedTasks.length} archived tasks? This will replace your current tasks.`)) {
                    importTasks(data.tasks, data.archivedTasks);
                }
            } catch (error) {
                alert("Error importing tasks: " + error.message);
            }
        };
        reader.readAsText(file);
    });
    
    // Export tasks
    exportBtn.addEventListener('click', exportTasks);
    
    // Update priority button text colors based on dark mode
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
    }
    
    // Initialize IndexedDB
    const request = indexedDB.open('TodoDB', 2); // Version 2 for archived tasks
    
    request.onerror = function(event) {
        console.error("Database error:", event.target.error);
        alert("Couldn't open database. Using localStorage instead.");
        const data = JSON.parse(localStorage.getItem('tasks')) || { tasks: [], archivedTasks: [] };
        tasks = data.tasks || [];
        archivedTasks = data.archivedTasks || [];
        renderTasks();
        renderArchivedTasks();
    };
    
    request.onupgradeneeded = function(event) {
        db = event.target.result;
        
        // Create object stores if they don't exist
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
    
    // Priority button selection
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active styles from all buttons
            document.querySelectorAll('.priority-btn').forEach(b => {
                b.classList.remove(
                    'bg-red-500', 'text-white', 'dark:bg-red-600',
                    'bg-yellow-500', 'dark:bg-yellow-600',
                    'bg-green-500', 'dark:bg-green-600'
                );
                b.classList.add(
                    'bg-white', 'dark:bg-dark-800'
                );
                
                // Set text color based on dark mode
                const isDarkMode = document.documentElement.classList.contains('dark');
                b.classList.toggle('text-white', isDarkMode);
                b.classList.toggle('text-black', !isDarkMode);
            });
            
            // Add active style to clicked button
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
    
    // Set medium as default selected
    document.querySelector('.priority-btn[data-priority="medium"]').click();
    
    function getAllTasks() {
        const transaction = db.transaction(['tasks'], 'readonly');
        const objectStore = transaction.objectStore('tasks');
        const request = objectStore.getAll();
        
        request.onsuccess = function(event) {
            tasks = event.target.result || [];
            renderTasks();
        };
        
        request.onerror = function(event) {
            console.error("Error fetching tasks:", event.target.error);
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
        };
        
        request.onerror = function(event) {
            console.error("Error fetching archived tasks:", event.target.error);
        };
    }
    
    // Add task
    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addTask();
        }
    });
    
    // Archive completed tasks
    archiveCompletedBtn.addEventListener('click', archiveCompletedTasks);
    
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
        
        request.onerror = function(event) {
            console.error("Error adding task:", event.target.error);
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
            // Add to archived
            const archivedTask = {
                ...task,
                archivedAt: new Date().toISOString()
            };
            archiveStore.add(archivedTask);
            
            // Remove from active
            tasksStore.delete(task.id);
        });
        
        tasksTransaction.oncomplete = function() {
            getAllTasks();
        };
        
        archiveTransaction.oncomplete = function() {
            getAllArchivedTasks();
            // Show archived tasks after archiving
            if (!showArchivedTasks) {
                showArchivedTasks = true;
                archivedTaskList.classList.remove('hidden');
                toggleArchivedTasksBtn.textContent = 'Hide';
            }
        };
        
        tasksTransaction.onerror = function(event) {
            console.error("Error archiving tasks:", event.target.error);
        };
        
        archiveTransaction.onerror = function(event) {
            console.error("Error adding to archive:", event.target.error);
        };
    }
    
    function deleteAllArchivedTasks() {
        if (archivedTasks.length === 0) return;
        
        const transaction = db.transaction(['archivedTasks'], 'readwrite');
        const objectStore = transaction.objectStore('archivedTasks');
        
        // Delete all archived tasks
        archivedTasks.forEach(task => {
            objectStore.delete(task.id);
        });
        
        transaction.oncomplete = function() {
            getAllArchivedTasks();
        };
        
        transaction.onerror = function(event) {
            console.error("Error deleting archived tasks:", event.target.error);
        };
    }
    
    function importTasks(newTasks, newArchivedTasks) {
        const tasksTransaction = db.transaction(['tasks'], 'readwrite');
        const tasksStore = tasksTransaction.objectStore('tasks');
        
        const archiveTransaction = db.transaction(['archivedTasks'], 'readwrite');
        const archiveStore = archiveTransaction.objectStore('archivedTasks');
        
        // Clear existing tasks
        tasksStore.clear();
        archiveStore.clear();
        
        // Add new tasks
        newTasks.forEach(task => {
            tasksStore.add(task);
        });
        
        newArchivedTasks.forEach(task => {
            archiveStore.add(task);
        });
        
        tasksTransaction.oncomplete = function() {
            getAllTasks();
        };
        
        archiveTransaction.oncomplete = function() {
            getAllArchivedTasks();
            alert(`Successfully imported ${newTasks.length} active tasks and ${newArchivedTasks.length} archived tasks`);
        };
        
        tasksTransaction.onerror = function(event) {
            console.error("Error importing tasks:", event.target.error);
            alert("Error importing tasks");
        };
        
        archiveTransaction.onerror = function(event) {
            console.error("Error importing archived tasks:", event.target.error);
            alert("Error importing archived tasks");
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
                exportedAt: new Date().toISOString()
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
    
    function renderTasks() {
        if (tasks.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
        }
        
        taskList.innerHTML = '';
        
        // Sort tasks: incomplete first, then completed (newest first)
        const sortedTasks = [...tasks].sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        sortedTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `px-6 py-4 flex items-center ${task.completed ? 'bg-gray-50 dark:bg-dark-600' : ''}`;
            taskElement.dataset.id = task.id;
            
            // Priority indicator colors
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
                <button class="complete-btn mr-4 w-6 h-6 rounded-full border-2 ${task.completed ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-dark-500'} flex items-center justify-center">
                    ${task.completed ? '<i class="fas fa-check text-xs"></i>' : ''}
                </button>
                <div class="flex-grow">
                    <div class="${task.completed ? 'line-through text-gray-500 dark:text-dark-400' : 'text-gray-800 dark:text-dark-100'}">${task.text}</div>
                    <div class="flex items-center mt-1">
                        <span class="text-xs px-2 py-1 rounded-full ${priorityColor} text-white mr-2">${priorityText}</span>
                        <span class="text-xs text-gray-500 dark:text-dark-400">${new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <button class="delete-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            taskList.appendChild(taskElement);
        });
        
        updateTaskCount();
    }
    
    function renderArchivedTasks() {
        if (archivedTasks.length === 0) {
            emptyArchivedState.style.display = 'block';
        } else {
            emptyArchivedState.style.display = 'none';
        }
        
        archivedTaskList.innerHTML = '';
        
        // Sort archived tasks by archive date (newest first)
        const sortedArchivedTasks = [...archivedTasks].sort((a, b) => 
            new Date(b.archivedAt) - new Date(a.archivedAt)
        );
        
        sortedArchivedTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'px-6 py-4 flex items-center bg-gray-50 dark:bg-dark-600';
            taskElement.dataset.id = task.id;
            
            // Priority indicator colors
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
                <div class="mr-4 w-6 h-6 flex items-center justify-center text-gray-400">
                    <i class="fas fa-archive"></i>
                </div>
                <div class="flex-grow">
                    <div class="line-through text-gray-500 dark:text-dark-400">${task.text}</div>
                    <div class="flex items-center mt-1">
                        <span class="text-xs px-2 py-1 rounded-full ${priorityColor} text-white mr-2">${priorityText}</span>
                        <span class="text-xs text-gray-500 dark:text-dark-400">Archived: ${new Date(task.archivedAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <button class="delete-archived-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-2">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            archivedTaskList.appendChild(taskElement);
        });
    }
    
    function updateTaskCount() {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.completed).length;
        
        taskCount.textContent = `${completedTasks} of ${totalTasks} tasks completed`;
        archiveCompletedBtn.disabled = completedTasks === 0;
    }
    
    // Event delegation for dynamic elements
    taskList.addEventListener('click', function(e) {
        const taskElement = e.target.closest('[data-id]');
        if (!taskElement) return;
        
        const taskId = parseInt(taskElement.dataset.id);
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Complete task
        if (e.target.closest('.complete-btn')) {
            const updatedTask = {...task, completed: !task.completed};
            
            const transaction = db.transaction(['tasks'], 'readwrite');
            const objectStore = transaction.objectStore('tasks');
            const request = objectStore.put(updatedTask);
            
            request.onsuccess = function() {
                getAllTasks();
            };
            
            request.onerror = function(event) {
                console.error("Error updating task:", event.target.error);
            };
        }
        
        // Delete task
        if (e.target.closest('.delete-btn')) {
            const transaction = db.transaction(['tasks'], 'readwrite');
            const objectStore = transaction.objectStore('tasks');
            const request = objectStore.delete(taskId);
            
            request.onsuccess = function() {
                getAllTasks();
            };
            
            request.onerror = function(event) {
                console.error("Error deleting task:", event.target.error);
            };
        }
    });
    
    // Event delegation for archived tasks
    archivedTaskList.addEventListener('click', function(e) {
        const taskElement = e.target.closest('[data-id]');
        if (!taskElement) return;
        
        const taskId = parseInt(taskElement.dataset.id);
        
        // Delete single archived task
        if (e.target.closest('.delete-archived-btn')) {
            const transaction = db.transaction(['archivedTasks'], 'readwrite');
            const objectStore = transaction.objectStore('archivedTasks');
            const request = objectStore.delete(taskId);
            
            request.onsuccess = function() {
                getAllArchivedTasks();
            };
            
            request.onerror = function(event) {
                console.error("Error deleting archived task:", event.target.error);
            };
        }
    });
    
    // Add touch feedback for mobile
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('touchstart', function() {
            this.classList.add('opacity-80');
        });
        
        button.addEventListener('touchend', function() {
            this.classList.remove('opacity-80');
        });
    });
    
    // Initial update of priority button text colors
    updatePriorityButtonTextColors();
});
