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
            taskElement.className = `px-6 py-4 flex items-start ${task.completed ? 'bg-gray-50 dark:bg-dark-600' : ''}`;
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
                <button class="delete-btn text-gray-400 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0">
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
            taskElement.className = 'px-6 py-4 flex items-start bg-gray-50 dark:bg-dark-600';
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
    }