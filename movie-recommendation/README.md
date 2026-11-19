# Movie Hierarchical Clustering & Recommendation Studio

> **Authors:** Władysław Farat, Grzegorz Piórek  
> **Course / Context:** Agglomerative Hierarchical Clustering for Sparse Ratings Matrices & Interactive Data Exploration

An interactive bottom-up hierarchical clustering and collaborative recommendation studio built with pure modern JavaScript (ES Modules, HTML5 Canvas, Tailwind CSS). The application groups movie titles based on reviewer affinity and generates personalized Top-5 recommendations and Top-5 anti-recommendations for sparse rating matrices.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology & Mathematical Formulation](#methodology--mathematical-formulation)
  - [1. User Mean Centering](#1-user-mean-centering)
  - [2. Adjusted Cosine Distance](#2-adjusted-cosine-distance)
  - [3. Agglomerative Hierarchical Clustering](#3-agglomerative-hierarchical-clustering)
  - [4. Linkage Criteria](#4-linkage-criteria)
  - [5. Hybrid Recommendation Engine](#5-hybrid-recommendation-engine)
- [Why Hierarchical Clustering Fits This Use Case](#why-hierarchical-clustering-fits-this-use-case)
  - [Advantages](#advantages)
  - [Trade-offs](#trade-offs)
- [Browser Studio Features (`index.html`)](#browser-studio-features-indexhtml)
  - [1. Interactive Cluster Bubbles View](#1-interactive-cluster-bubbles-view)
  - [2. Merge Step Timeline & Scrubber Playback](#2-merge-step-timeline--scrubber-playback)
  - [3. Reviewer & Scope Controls](#3-reviewer--scope-controls)
  - [4. Rich Inspector & Movie Detail Modal](#4-rich-inspector--movie-detail-modal)
  - [5. Live TMDb Enrichment & Custom Dataset Upload](#5-live-tmdb-enrichment--custom-dataset-upload)
  - [6. JSON Export & Snapshotting](#6-json-export--snapshotting)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
  - [Running the Browser Studio](#running-the-browser-studio)
  - [Running via Node.js CLI](#running-via-nodejs-cli)
  - [Importing as an ES Module](#importing-as-an-es-module)
  - [Batch TMDb Enrichment CLI](#batch-tmdb-enrichment-cli)

---

## Problem Statement

Collaborative filtering datasets in smaller communities or private groups exhibit severe **matrix sparsity**. In our dataset of 189 movie titles reviewed across 11 participants:
- Most movies have only 1 to 4 reviews.
- Only 64 titles have been rated by 2 or more reviewers.
- Different reviewers employ differing rating scales (e.g., severe critics whose average score is ~5.5 vs. generous reviewers whose average score is ~8.5).

Traditional centroid-based algorithms (such as $K$-Means) fail under these conditions:
1. **Centroid computation requires dense coordinate spaces:** Imputing missing ratings with 0 or a global mean severely distorts distances and drags items toward arbitrary baselines.
2. **Fixed $K$ restriction:** In exploratory data analysis, the optimal number of natural taste clusters is unknown beforehand.

---

## Methodology & Mathematical Formulation

### 1. User Mean Centering

To eliminate individual rating biases (strict vs. generous reviewers), we calculate each reviewer $u$'s mean rating across all movies they evaluated $I_u$:

$$\mu_u = \frac{1}{|I_u|} \sum_{i \in I_u} R_{i, u}$$

Where $R_{i, u} \in [1, 10]$ is the raw rating given by reviewer $u$ to movie $i$.

Each movie is converted into a mean-centered sparse vector $v_i$:

$$v_{i, u} = \begin{cases} R_{i, u} - \mu_u & \text{if } R_{i, u} \ne \mu_u \\ 0.01 & \text{if } R_{i, u} = \mu_u \text{ (to distinguish from unrated)} \end{cases}$$

Additionally, we compute the movie's **peer sentiment** $\bar{s}_i$ (the average centered sentiment of all reviewers who rated it):

$$\bar{s}_i = \frac{1}{|U_i|} \sum_{u \in U_i} (R_{i, u} - \mu_u)$$

Where $U_i$ is the set of reviewers who rated movie $i$.

---

### 2. Adjusted Cosine Distance

Given two movies $i$ and $j$, let $U_{i, j} = U_i \cap U_j$ denote the set of reviewers who rated **both** movies.

If $|U_{i, j}| = 0$ or the norms are 0, the distance defaults to maximum dissimilarity:

$$d(i, j) = 2.0$$

Otherwise, adjusted cosine similarity is calculated over overlapping reviewers:

$$\text{sim}(i, j) = \frac{\sum_{u \in U_{i, j}} v_{i, u} \cdot v_{j, u}}{\sqrt{\sum_{u \in U_{i, j}} v_{i, u}^2} \cdot \sqrt{\sum_{u \in U_{i, j}} v_{j, u}^2}}$$

The pairwise dissimilarity distance is defined in range $[0, 2]$:

$$d(i, j) = 1 - \text{sim}(i, j)$$

- $d = 0$: Perfect alignment in reviewer sentiment.
- $d = 1$: Orthogonal / uncorrelated opinions.
- $d = 2$: Opposite opinions or zero reviewer overlap.

---

### 3. Agglomerative Hierarchical Clustering

1. **Initialization:** Start with each movie as an individual singleton cluster $C_k = \{k\}$ ($N$ clusters total).
2. **Pairwise Search:** Find the pair of active clusters $(C_A, C_B)$ that minimizes the cluster distance $D(C_A, C_B)$.
3. **Merge & Record:** Merge $C_A$ and $C_B$ into a new internal node in the dendrogram tree, record the merge step distance and snapshot, and reduce the cluster count by 1.
4. **Stopping Criteria:** Repeat until target cluster count $K$ is reached or the merge distance exceeds the maximum threshold ($d_{\max} = 0.85$).

---

### 4. Linkage Criteria

The engine supports three linkage metrics:

- **Average Linkage (Default / UPGMA):**
  $$D_{\text{avg}}(C_A, C_B) = \frac{1}{|C_A| \cdot |C_B|} \sum_{i \in C_A} \sum_{j \in C_B} d(i, j)$$
  *Balanced, robust against outliers, and yields natural movie genre/taste groupings.*

- **Single Linkage (Minimum Distance):**
  $$D_{\text{single}}(C_A, C_B) = \min_{i \in C_A, j \in C_B} d(i, j)$$
  *Useful for chaining closely related series or franchises.*

- **Complete Linkage (Maximum Distance):**
  $$D_{\text{complete}}(C_A, C_B) = \max_{i \in C_A, j \in C_B} d(i, j)$$
  *Enforces compact, tightly coupled cliques.*

---

### 5. Hybrid Recommendation Engine

For a designated reviewer $u$:

1. **Cluster Affinity:** For each cluster $C$, compute reviewer $u$'s mean centered rating across movies in $C$ they have already seen:
   $$\text{Affinity}(u, C) = \frac{1}{|C \cap I_u|} \sum_{i \in C \cap I_u} v_{i, u}$$

2. **Cluster-level Candidate Scoring:** For every unseen movie $j \in C \setminus I_u$:
   $$\text{Score}(u, j) = \begin{cases} \text{Affinity}(u, C) + 0.35 \cdot \bar{s}_j & \text{if } \text{Affinity}(u, C) \ge 0 \\ \text{Affinity}(u, C) - 0.35 \cdot |\bar{s}_j| & \text{if } \text{Affinity}(u, C) < 0 \end{cases}$$

3. **Collaborative Peer-Similarity Fallback:** For movies not covered by cluster affinity, compute reviewer-to-reviewer taste similarity $\text{Sim}(u, w)$:
   $$\text{FallbackScore}(u, j) = \frac{\sum_{w \in U_j, |\text{Sim}(u, w)| > 0.05} \text{Sim}(u, w) \cdot v_{j, w}}{\sum |\text{Sim}(u, w)|}$$

4. **Predicted Rating:**
   $$\hat{R}_{u, j} = \text{clamp}_{[1, 10]}\left(\mu_u + \text{Score}(u, j)\right)$$

5. **Output:**
   - **Top-5 Recommendations:** The 5 unseen movies with the highest positive predicted scores.
   - **Top-5 Anti-Recommendations:** The 5 unseen movies with the strongest negative predicted scores (worst titles first).

---

## Why Hierarchical Clustering Fits This Use Case

### Advantages

- **Flexible Similarity Metrics:** Operates directly on a pairwise dissimilarity matrix rather than requiring dense geometric coordinate centroids.
- **No Need to Pre-Guess $K$:** The tree is computed once; the cutoff threshold can be interactively scrubbed to explore coarse vs. fine groupings.
- **Zero External Dependencies:** Implemented in clean, dependency-free JavaScript.
- **Deterministic:** Always yields the exact same dendrogram tree without random seed initialization variance.
- **Fast on Compact Datasets:** For $N = 189$ items, $O(N^3)$ merge operations take less than $10\text{ ms}$ in JavaScript.

### Trade-offs

- **Scalability Limit:** $O(N^3)$ computational time and $O(N^2)$ space complexity make pure in-memory browser clustering slow once $N > 3{,}000$ titles.
- **Irreversible Merges:** Greedy agglomeration cannot undo a cluster merge formed early in the process.

---

## Browser Studio Features (`index.html`)

The browser studio provides an interactive interface for exploring cluster formations, inspecting metadata, and auditing recommendations.

### 1. Interactive Cluster Bubbles View
- **Physics Simulation:** Force-directed 2D canvas simulation that pulls co-clustered movies together while repelling unrelated clusters.
- **Visual Sentiment Coding:**
  - 🟢 **Emerald:** Clusters highly liked by the active reviewer ($\text{Affinity} > 0$).
  - 🔴 **Rose:** Clusters disliked by the active reviewer ($\text{Affinity} < 0$).
  - 🔵 **Sky / Neutral:** Clusters with no rated titles for the selected reviewer.
- **Node Sizing:** Bubble radius reflects the number of reviewer ratings.
- **Pan & Zoom:** Smooth panning via mouse drag, zooming via wheel / pinch gesture, and a **Fit View** reset button.
- **Interactive Tooltips:** Real-time hover details with review counts and average ratings.

### 2. Merge Step Timeline & Scrubber Playback
- **Timeline Slider:** Scrub through all clustering steps from step 0 ($N$ singletons) up to step $N-1$ (single cluster).
- **Automated Playback:** Play/Pause button with adjustable simulation speed ($150\text{ ms}$ to $900\text{ ms}$ per step) to visualize clusters merging in real time.
- **Live Metrics:** Displays current cut distance and active cluster count.

### 3. Reviewer & Scope Controls
- **Reviewer Selector:** Select any of the 11 reviewers to instantly recalculate recommendations, cluster affinities, and color coding.
- **Dataset Scope Toggle:**
  - **Shared Titles (64 movies):** Filters to titles with $\ge 2$ ratings for robust cross-reviewer clustering.
  - **All Titles (189 movies):** Includes singletons and specialized titles.
- **Linkage Criterion Toggle:** Switch dynamically between **Average Linkage**, **Single Linkage**, and **Complete Linkage**.
- **Real-Time Search Bar:** Instantly highlights matching movie bubbles.

### 4. Rich Inspector & Movie Detail Modal
- **Contextual Inspector:** Clicking any movie reveals its cluster number, co-clustered titles, reviewer ratings with centered differentials $(R - \mu)$, TMDb vote average, and synopsis.
- **Full Card Modal:** View official TMDb high-resolution posters, release year, media type (movie vs. TV show), and synopsis.

### 5. Live TMDb Enrichment & Custom Dataset Upload
- **Live TMDb API Fetcher:** Enter a TMDb Bearer token to fetch synopses, posters, release dates, and vote averages directly from the browser with an interactive progress bar.
- **Load JSON:** Upload any custom ratings JSON file or pre-enriched metadata file.

### 6. JSON Export & Snapshotting
- **Clusters Tab:** Export current clustering state, cut distance, active clusters, affinity scores, recommendations, and anti-recommendations.
- **Enriched Dataset Tab:** Export the full dataset hydrated with all TMDb posters and overviews.
- **One-click Copy & Download:** Download `.json` files directly to your machine.

---

## Project Structure

```text
.
├── index.html                    # Interactive Browser Clustering & Recommender Studio
├── index.js                      # Core Agglomerative Clustering & Recommendation Engine (ES Module & CLI)
├── enrich_movies.js              # Node.js batch TMDb metadata enrichment script
├── enriched_movie_ratings.json   # Full dataset (189 movies, 11 reviewers, with TMDb posters & synopses)
├── normalized_movie_ratings.json # Base ratings dataset (189 movies, 11 reviewers)
├── package.json                  # Manifest ("type": "module")
└── README.md                     # Documentation
```

---

## Quick Start

### Running the Browser Studio

Because `index.html` loads `index.js` and JSON data via standard ES Module imports, it should be served via a local web server:

```bash
# Option 1: WebStorm / IntelliJ
# Right-click index.html -> "Open in Browser" (uses built-in port 63342)

# Option 2: Node.js npx serve
npx serve .

# Option 3: Python 3 built-in server
python -m http.server 8000
```

Open `http://localhost:8000` (or the provided port) in your browser.

---

### Running via Node.js CLI

To run the standalone recommendation demo directly from the terminal:

```bash
node index.js
```

Example CLI Output:

```json
{
  "person": "Paweł Czapiewski",
  "userAverageRating": 7.27,
  "recommendations": [
    { "movie": "Zadzwoń do Saula", "score": 3.646, "predictedRating": 10, "source": "cluster", "clusterId": 10 },
    { "movie": "Chłopaki nie płaczą", "score": 3.646, "predictedRating": 10, "source": "cluster", "clusterId": 10 },
    { "movie": "Diuna: Część druga", "score": 3.646, "predictedRating": 10, "source": "cluster", "clusterId": 10 },
    { "movie": "Kiler", "score": 3.646, "predictedRating": 10, "source": "cluster", "clusterId": 10 },
    { "movie": "One Piece", "score": 3.646, "predictedRating": 10, "source": "cluster", "clusterId": 10 }
  ],
  "antiRecommendations": [
    { "movie": "Kill Bill", "score": -8.381, "predictedRating": 1, "source": "cluster", "clusterId": 18 },
    { "movie": "Obecność", "score": -6.999, "predictedRating": 1, "source": "cluster", "clusterId": 18 },
    { "movie": "Battlestar Galactica", "score": -6.481, "predictedRating": 1, "source": "cluster", "clusterId": 18 },
    { "movie": "Pulp Fiction", "score": -6.451, "predictedRating": 1, "source": "cluster", "clusterId": 18 },
    { "movie": "Rambo: Pierwsza krew", "score": -6.343, "predictedRating": 1, "source": "cluster", "clusterId": 18 }
  ]
}
```

---

### Importing as an ES Module

All clustering functions in `index.js` can be imported into your own modules:

```javascript
import {
  preprocessDataset,
  buildFullDendrogram,
  buildMovieClusters,
  computeRecommendations,
  getRecommendations,
  loadDefaultDataset,
} from './index.js';

// Load dataset (works in both Node.js and Browser)
const dataset = await loadDefaultDataset('./enriched_movie_ratings.json');

// Generate top recommendations for a reviewer
const results = getRecommendations("Władysław Farat", dataset, {
  targetClusters: 18,
  maxDistance: 0.85,
  linkage: "average",
});

console.log("Top Recommendations:", results.recommendations);
console.log("Anti-Recommendations:", results.antiRecommendations);
```