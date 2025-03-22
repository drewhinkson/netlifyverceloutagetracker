// Reddit tab functionality - completely independent from script.js
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on the Reddit tab page
    const redditContainer = document.getElementById('reddit-comments-container');
    if (!redditContainer) return;
    
    // Hardcode the API path to avoid any issues
    const API_PATH = '/api/reddit';
    
    // Set up refresh button
    document.getElementById('refresh-reddit-btn').addEventListener('click', function() {
        loadRedditComments(API_PATH, true);
    });
    
    // Load the data - silently (without errors)
    loadRedditComments(API_PATH, false);
    
    // Set up auto-refresh every hour (3600000 ms)
    setInterval(function() {
        loadRedditComments(API_PATH, false);
    }, 3600000);
});

// Load Reddit comments from API
async function loadRedditComments(apiPath, showErrors) {
    // Set placeholder content
    document.getElementById('reddit-comments-container').innerHTML = `
        <div class="flex justify-center items-center h-48">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    `;
    
    try {
        // Use the fetch API to get data
        const response = await fetch(apiPath);
        
        // Parse the JSON response
        const data = await response.json();
        
        // Verify each post mentions both Vercel and Netlify
        const verifiedPosts = [];
        const seenAuthors = new Set(); // Track authors to ensure diversity
        
        // Manual verification and author deduplication
        if (Array.isArray(data)) {
            for (const post of data) {
                const title = String(post.title || '').toLowerCase();
                const snippet = String(post.snippet || '').toLowerCase();
                const author = String(post.author || '').toLowerCase();
                
                // Skip if we've already included a post from this author
                if (seenAuthors.has(author)) continue;
                
                // Verify both Vercel and Netlify are mentioned
                if ((title.includes('vercel') || snippet.includes('vercel')) && 
                    (title.includes('netlify') || snippet.includes('netlify'))) {
                    verifiedPosts.push(post);
                    seenAuthors.add(author); // Add author to seen set
                }
                
                // Limit to 10 posts with different authors
                if (verifiedPosts.length >= 10) break;
            }
        }
        
        // Update the UI with verified posts
        if (verifiedPosts.length > 0) {
            displayRedditComments(verifiedPosts);
            
            // Update last refreshed time
            const now = new Date();
            document.getElementById('reddit-last-updated').textContent = `Last updated: ${now.toLocaleTimeString()}`;
        } else {
            // No verified posts found
            document.getElementById('reddit-comments-container').innerHTML = `
                <div class="bg-gray-100 p-4 rounded text-center">
                    <p class="text-gray-500">No discussions found mentioning both Vercel and Netlify.</p>
                    <button class="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded-md text-sm font-medium transition" 
                            onclick="loadRedditComments('${apiPath}', true)">
                        Check Again
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading Reddit comments:', error);
        
        // Only show error if requested
        if (showErrors) {
            document.getElementById('reddit-comments-container').innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
                    <p>Error loading discussions. Please try again later.</p>
                    <button class="mt-2 bg-red-200 hover:bg-red-300 text-red-800 px-3 py-1 rounded-md text-sm font-medium transition"
                            onclick="loadRedditComments('${apiPath}', true)">
                        Try Again
                    </button>
                </div>
            `;
        } else {
            // Show empty state instead of error
            document.getElementById('reddit-comments-container').innerHTML = `
                <div class="bg-gray-100 p-4 rounded text-center">
                    <p class="text-gray-500">No discussions available right now.</p>
                    <button class="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded-md text-sm font-medium transition"
                            onclick="loadRedditComments('${apiPath}', true)">
                        Check Again
                    </button>
                </div>
            `;
        }
    }
}

// Display Reddit comments with sorting capability
function displayRedditComments(comments) {
    const container = document.getElementById('reddit-comments-container');
    
    // Add sorting options
    const sortingHtml = `
        <div class="mb-4 flex justify-end">
            <div class="inline-flex rounded-md shadow-sm" role="group">
                <button id="sort-newest" class="py-1 px-3 text-sm font-medium text-blue-700 bg-blue-100 rounded-l-lg border border-blue-200 hover:bg-blue-200 focus:z-10 focus:ring-2 focus:ring-blue-300 focus:text-blue-700">
                    Newest
                </button>
                <button id="sort-top" class="py-1 px-3 text-sm font-medium text-gray-900 bg-white rounded-r-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-2 focus:ring-blue-700 focus:text-blue-700">
                    Top Points
                </button>
            </div>
        </div>
    `;
    
    // Create HTML for comments
    const commentsHtml = comments.map(comment => {
        // Format created date
        const createdDate = new Date((comment.created || 0) * 1000).toLocaleDateString();
        
        return `
            <div class="bg-white rounded-lg shadow-md p-4 border-l-4 border-gray-200 mb-4 hover:shadow-lg transition-shadow" 
                 data-score="${comment.score || 0}" 
                 data-created="${comment.created || 0}">
                <h3 class="font-medium text-lg mb-2">${comment.title}</h3>
                <p class="text-gray-600 text-sm mb-3">${comment.snippet}</p>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <div>
                        <span>Posted in ${comment.subreddit || 'Reddit'}</span> • 
                        <span>${createdDate}</span> • 
                        <span>by ${comment.author || 'unknown'}</span>
                    </div>
                    <div>
                        <span>${comment.score || 0} points</span> • 
                        <span>${comment.num_comments || 0} comments</span> • 
                        <a href="${comment.url || '#'}" target="_blank" class="text-blue-500 hover:underline">
                            View on Reddit
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Update the container content
    container.innerHTML = sortingHtml + commentsHtml;
    
    // Set up sorting functionality
    document.getElementById('sort-newest').addEventListener('click', function() {
        sortComments('newest');
        this.classList.replace('bg-white', 'bg-blue-100');
        this.classList.replace('text-gray-900', 'text-blue-700');
        document.getElementById('sort-top').classList.replace('bg-blue-100', 'bg-white');
        document.getElementById('sort-top').classList.replace('text-blue-700', 'text-gray-900');
    });
    
    document.getElementById('sort-top').addEventListener('click', function() {
        sortComments('top');
        this.classList.replace('bg-white', 'bg-blue-100');
        this.classList.replace('text-gray-900', 'text-blue-700');
        document.getElementById('sort-newest').classList.replace('bg-blue-100', 'bg-white');
        document.getElementById('sort-newest').classList.replace('text-blue-700', 'text-gray-900');
    });
    
    // Initial sort - newest first
    sortComments('newest');
}

// Sort comments by newest or top
function sortComments(order) {
    const container = document.getElementById('reddit-comments-container');
    const comments = Array.from(container.querySelectorAll('[data-created]'));
    
    if (order === 'newest') {
        comments.sort((a, b) => 
            parseInt(b.getAttribute('data-created')) - parseInt(a.getAttribute('data-created'))
        );
    } else if (order === 'top') {
        comments.sort((a, b) => 
            parseInt(b.getAttribute('data-score')) - parseInt(a.getAttribute('data-score'))
        );
    }
    
    // Get the sorting element
    const sortingElement = container.querySelector('div:first-child');
    
    // Clear container (except sorting controls)
    while (container.childNodes.length > 1) {
        container.removeChild(container.lastChild);
    }
    
    // Add sorted comments back
    comments.forEach(comment => container.appendChild(comment));
}

// Make functions globally available
window.loadRedditComments = loadRedditComments;