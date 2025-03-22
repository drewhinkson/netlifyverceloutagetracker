
const API_PATHS = [
    '/api/reddit',
    '/.netlify/functions/reddit',
    '/reddit'
];

// When the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Set up refresh button
    document.getElementById('refresh-reddit-btn').addEventListener('click', refreshRedditData);
    
    // Initial load
    loadRedditData();
    
    // Auto-refresh every hour
    setInterval(loadRedditData, 3600000);
});

// Load Reddit data
async function loadRedditData() {
    showLoading();
    let succeeded = false;
    
    // Try each API path until one works
    for (const path of API_PATHS) {
        try {
            console.log(`Attempting to fetch from: ${path}`);
            succeeded = await tryFetchRedditPosts(path);
            if (succeeded) break;
        } catch (error) {
            console.error(`Failed with path ${path}:`, error);
        }
    }
    
    if (!succeeded) {
        console.error("All API paths failed");
        showEmpty();
    }
}

// Refresh data (with error handling)
function refreshRedditData() {
    loadRedditData();
}

// Show loading spinner
function showLoading() {
    document.getElementById('reddit-comments-container').innerHTML = `
        <div class="flex justify-center items-center h-48">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    `;
}

// Try a specific API path
async function tryFetchRedditPosts(apiPath) {
    try {
        console.log(`Fetching from ${apiPath}...`);
        const response = await fetch(apiPath);
        
        if (!response.ok) {
            console.error(`Response not OK: ${response.status}`);
            return false;
        }
        
        const data = await response.json();
        console.log(`Got data from ${apiPath}, items:`, data ? data.length : 0);
        
        // Apply extremely strict filtering
        const processedPosts = strictlyFilterPosts(data);
        console.log(`After filtering: ${processedPosts.length} posts`);
        
        if (processedPosts.length > 0) {
            displayPosts(processedPosts);
            updateLastUpdated();
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`Error with ${apiPath}:`, error);
        return false;
    }
}

// Extremely strict filtering to only include posts that definitely mention both platforms
function strictlyFilterPosts(posts) {
    console.log("Filtering posts...");
    
    if (!Array.isArray(posts)) {
        console.error("Posts is not an array:", typeof posts);
        return [];
    }
    
    const result = [];
    const seenAuthors = new Set();
    
    for (const post of posts) {
        // Skip if missing data
        if (!post || !post.title) {
            console.log("Skipping post with missing data");
            continue;
        }
        
        // Get text content
        const title = (post.title || '').toLowerCase();
        const snippet = (post.snippet || '').toLowerCase();
        
        // Log for debugging
        console.log(`Checking post: "${title.substring(0, 40)}..."`);
        console.log(`Vercel in title: ${title.includes('vercel')}`);
        console.log(`Netlify in title: ${title.includes('netlify')}`);
        console.log(`Vercel in snippet: ${snippet.includes('vercel')}`);
        console.log(`Netlify in snippet: ${snippet.includes('netlify')}`);
        
        // SUPER STRICT: Ensure both Vercel AND Netlify are mentioned
        if (!containsBothTerms(title, snippet)) {
            console.log("Skipping - doesn't mention both platforms");
            continue;
        }
        
        console.log("Post accepted - mentions both platforms");
        
        // Skip if we already have a post from this author
        if (seenAuthors.has(post.author)) {
            console.log(`Skipping duplicate author: ${post.author}`);
            continue;
        }
        
        // Add author to seen set
        seenAuthors.add(post.author);
        result.push(post);
        
        // Limit to 10 different authors
        if (result.length >= 10) break;
    }
    
    return result;
}

// Check if text contains both Vercel and Netlify
function containsBothTerms(title, snippet) {
    const vercelInTitle = title.includes('vercel');
    const netlifyInTitle = title.includes('netlify');
    const vercelInSnippet = snippet.includes('vercel');
    const netlifyInSnippet = snippet.includes('netlify');
    
    // Both terms must appear somewhere
    return (vercelInTitle || vercelInSnippet) && (netlifyInTitle || netlifyInSnippet);
}

// Display posts with sorting
function displayPosts(posts) {
    const container = document.getElementById('reddit-comments-container');
    
    // Add sorting controls
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
    
    // Create HTML for posts
    const postsHtml = posts.map(post => {
        // Format date
        const date = new Date((post.created || 0) * 1000).toLocaleDateString();
        
        // Highlight Vercel and Netlify mentions in the title
        let highlightedTitle = post.title;
        try {
            // Case-insensitive highlight with original case preserved
            highlightedTitle = highlightTerms(post.title, ['vercel', 'netlify']);
        } catch (e) {
            console.error('Error highlighting title:', e);
        }
        
        return `
            <div class="bg-white rounded-lg shadow-md p-4 border-l-4 border-gray-200 mb-4 hover:shadow-lg transition-shadow" 
                 data-score="${post.score || 0}" 
                 data-created="${post.created || 0}">
                <h3 class="font-medium text-lg mb-2">${highlightedTitle}</h3>
                <p class="text-gray-600 text-sm mb-3">${post.snippet}</p>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <div>
                        <span>Posted in ${post.subreddit || 'Reddit'}</span> • 
                        <span>${date}</span> • 
                        <span>by ${post.author || 'unknown'}</span>
                    </div>
                    <div>
                        <span>${post.score || 0} points</span> • 
                        <span>${post.num_comments || 0} comments</span> • 
                        <a href="${post.url || '#'}" target="_blank" class="text-blue-500 hover:underline">
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
    
    // Update container
    container.innerHTML = sortingHtml + postsHtml;
    
    // Set up sorting functionality
    setupSorting();
}

// Highlight terms in text while preserving case
function highlightTerms(text, terms) {
    // Clone the text to avoid modifying the original
    let result = text;
    
    // Process each term
    for (const term of terms) {
        // Create a regex that matches the term case-insensitively
        const regex = new RegExp(`(${term})`, 'gi');
        
        // Replace with a subtle background highlight
        result = result.replace(regex, '<span class="bg-gray-100 rounded px-1">$1</span>');
    }
    
    return result;
}

// Set up sorting functionality
function setupSorting() {
    document.getElementById('sort-newest').addEventListener('click', function() {
        sortPosts('newest');
        updateSortButtons(this, document.getElementById('sort-top'));
    });
    
    document.getElementById('sort-top').addEventListener('click', function() {
        sortPosts('top');
        updateSortButtons(this, document.getElementById('sort-newest'));
    });
    
    // Initial sort
    sortPosts('newest');
}

// Update sort button styling
function updateSortButtons(active, inactive) {
    active.classList.replace('bg-white', 'bg-blue-100');
    active.classList.replace('text-gray-900', 'text-blue-700');
    inactive.classList.replace('bg-blue-100', 'bg-white');
    inactive.classList.replace('text-blue-700', 'text-gray-900');
}

// Sort posts
function sortPosts(order) {
    const container = document.getElementById('reddit-comments-container');
    const posts = Array.from(container.querySelectorAll('[data-created]'));
    
    if (order === 'newest') {
        posts.sort((a, b) => 
            parseInt(b.getAttribute('data-created')) - parseInt(a.getAttribute('data-created'))
        );
    } else if (order === 'top') {
        posts.sort((a, b) => 
            parseInt(b.getAttribute('data-score')) - parseInt(a.getAttribute('data-score'))
        );
    }
    
    // Get the sorting element
    const sortingElement = container.querySelector('div:first-child');
    
    // Clear container (except sorting controls)
    while (container.childNodes.length > 1) {
        container.removeChild(container.lastChild);
    }
    
    // Add sorted posts back
    posts.forEach(post => container.appendChild(post));
}

// Show empty state
function showEmpty() {
    document.getElementById('reddit-comments-container').innerHTML = `
        <div class="bg-gray-100 p-4 rounded text-center">
            <p class="text-gray-500">No discussions found mentioning both Vercel and Netlify.</p>
            <button class="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded-md text-sm font-medium transition" 
                    onclick="refreshRedditData()">
                Check Again
            </button>
        </div>
    `;
}

// Show error state
function showError() {
    document.getElementById('reddit-comments-container').innerHTML = `
        <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
            <p>Could not load discussions. Please try again later.</p>
            <button class="mt-2 bg-red-200 hover:bg-red-300 text-red-800 px-3 py-1 rounded-md text-sm font-medium transition"
                    onclick="refreshRedditData()">
                Try Again
            </button>
        </div>
    `;
}

// Update last updated time
function updateLastUpdated() {
    const now = new Date();
    document.getElementById('reddit-last-updated').textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

// Make functions globally available
window.refreshRedditData = refreshRedditData;