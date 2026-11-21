/**
 * @file Agglomerative Hierarchical Clustering & Collaborative Recommendation Engine.
 *
 * In a sparse movie ratings matrix where each reviewer only rates a handful of titles,
 * standard centroid-based methods break down, so we apply agglomerative hierarchical
 * clustering on a pairwise adjusted cosine distance matrix over overlapping ratings.
 * This approach deterministically groups titles by shared user sentiment without requiring
 * a pre-set cluster count K, executing in milliseconds on compact datasets.
 *
 * @author Władysław Farat
 * @author Grzegorz Piórek
 *
 * How to use:
 * Option 1: Run node index.js
 * Option 2: Open index.html in the browser for visualization
 */

/**
 * Preprocesses the raw dataset by computing reviewer totals, average ratings,
 * and mean-centered sparse rating vectors for each title.
 * Preserves optional TMDb metadata if present.
 *
 * @param {Array<{movie: string, ratings: Array<{person: string, rating: number}>, metadata?: Object}>} dataset - Raw movie ratings dataset.
 * @returns {{movies: Array<Object>, allMovies: Array<Object>, userMeans: Object<string, number>, userCounts: Object<string, number>}} Preprocessed movies and reviewer statistics.
 */
export function preprocessDataset(dataset) {
    const userTotals = {};
    const userCounts = {};

    for (const item of dataset) {
        for (const { person, rating } of item.ratings) {
            userTotals[person] = (userTotals[person] || 0) + rating;
            userCounts[person] = (userCounts[person] || 0) + 1;
        }
    }

    const userMeans = {};
    for (const person of Object.keys(userTotals)) {
        userMeans[person] = userTotals[person] / userCounts[person];
    }

    const movies = dataset.map((item) => {
        const vector = {};
        let centeredSum = 0;

        for (const { person, rating } of item.ratings) {
            const centered = rating - userMeans[person];
            vector[person] = centered === 0 ? 0.01 : centered;
            centeredSum += centered;
        }

        return {
            movie: item.movie,
            rawRatings: item.ratings,
            metadata: item.metadata || null,
            vector,
            // Average centered sentiment of all reviewers who rated this movie
            peerSentiment: item.ratings.length > 0 ? centeredSum / item.ratings.length : 0,
        };
    });

    return {
        movies,
        allMovies: movies,
        userMeans,
        userCounts,
    };
}

/**
 * Alias for `preprocessDataset` to maintain backwards compatibility with UI components.
 * @type {typeof preprocessDataset}
 */
export const computeUserStatsAndVectors = preprocessDataset;

/**
 * Calculates the Adjusted Cosine Distance between two sparse rating vectors.
 * Computed exclusively over overlapping reviewers.
 *
 * @param {Object<string, number>} vecA - Mean-centered sparse rating vector for movie A.
 * @param {Object<string, number>} vecB - Mean-centered sparse rating vector for movie B.
 * @returns {number} Cosine distance in range [0, 2] (0 = identical taste, 1 = orthogonal, 2 = opposite).
 */
export function cosineDistance(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    let overlap = 0;

    for (const person of Object.keys(vecA)) {
        if (person in vecB) {
            dotProduct += vecA[person] * vecB[person];
            normA += vecA[person] ** 2;
            normB += vecB[person] ** 2;
            overlap++;
        }
    }

    if (overlap === 0 || normA === 0 || normB === 0) return 2.0;

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity;
}

/**
 * Computes a full pairwise cosine distance proximity matrix for an array of movies.
 *
 * @param {Array<{vector: Object<string, number>}>} movies - Array of preprocessed movie objects with sparse vectors.
 * @returns {Float64Array[]} Symmetric n-by-n proximity matrix where entry [i][j] is distance between movies i and j.
 */
export function computeProximityMatrix(movies) {
    const n = movies.length;
    const matrix = Array.from({ length: n }, () => new Float64Array(n));

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dist = cosineDistance(movies[i].vector, movies[j].vector);
            matrix[i][j] = dist;
            matrix[j][i] = dist;
        }
    }
    return matrix;
}

/**
 * Calculates the cluster-to-cluster linkage distance between two clusters of movie indices.
 *
 * @param {number[]} clusterA - Array of movie indices in the first cluster.
 * @param {number[]} clusterB - Array of movie indices in the second cluster.
 * @param {Float64Array[]} proximityMatrix - Precomputed pairwise proximity matrix.
 * @param {"average"|"single"|"complete"} [linkage="average"] - Linkage criterion to apply.
 * @returns {number} Distance between cluster A and cluster B.
 */
export function clusterDistance(clusterA, clusterB, proximityMatrix, linkage = "average") {
    if (linkage === "single") {
        let minD = Infinity;
        for (const a of clusterA) {
            for (const b of clusterB) {
                if (proximityMatrix[a][b] < minD) minD = proximityMatrix[a][b];
            }
        }
        return minD;
    }
    if (linkage === "complete") {
        let maxD = -Infinity;
        for (const a of clusterA) {
            for (const b of clusterB) {
                if (proximityMatrix[a][b] > maxD) maxD = proximityMatrix[a][b];
            }
        }
        return maxD;
    }
    // Default: average linkage
    let totalDist = 0;
    let pairs = 0;
    for (const a of clusterA) {
        for (const b of clusterB) {
            totalDist += proximityMatrix[a][b];
            pairs++;
        }
    }
    return pairs > 0 ? totalDist / pairs : 0;
}

/**
 * Builds the full agglomerative hierarchical clustering merge history (dendrogram tree and step snapshots).
 *
 * @param {Array<{movie: string, vector: Object<string, number>}>} movies - Array of preprocessed movies.
 * @param {"average"|"single"|"complete"} [linkage="average"] - Linkage criterion to use during clustering.
 * @returns {{treeNodes: Array<{id: number, isLeaf: boolean, movieIdx: number|null, label: string, left: number|null, right: number|null, height: number, leaves: number[]}>, rootNode: Object|null, steps: Array<{step: number, distance: number, mergedA: string[]|null, mergedB: string[]|null, clusters: number[][]}>, proximity: Float64Array[]}} Dendrogram tree representation and step history.
 */
export function buildFullDendrogram(movies, linkage = "average") {
    const n = movies.length;
    if (n === 0) {
        return { treeNodes: [], rootNode: null, steps: [], proximity: [] };
    }
    const proximity = computeProximityMatrix(movies);

    // Tree nodes: 0..n-1 are leaf nodes; n..2n-2 are internal merge nodes
    const treeNodes = movies.map((m, idx) => ({
        id: idx,
        isLeaf: true,
        movieIdx: idx,
        label: m.movie,
        left: null,
        right: null,
        height: 0,
        leaves: [idx],
    }));

    // Active cluster wrappers
    let active = treeNodes.map((node) => ({
        nodeId: node.id,
        leaves: [node.movieIdx],
    }));

    const steps = [
        {
            step: 0,
            distance: 0,
            mergedA: null,
            mergedB: null,
            clusters: active.map((c) => [...c.leaves]),
        },
    ];

    for (let step = 1; step < n; step++) {
        let bestDist = Infinity;
        let bestI = 0;
        let bestJ = 1;

        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const d = clusterDistance(active[i].leaves, active[j].leaves, proximity, linkage);
                if (d < bestDist) {
                    bestDist = d;
                    bestI = i;
                    bestJ = j;
                }
            }
        }

        const clusterA = active[bestI];
        const clusterB = active[bestJ];
        const combinedLeaves = [...clusterA.leaves, ...clusterB.leaves];

        const newNodeId = treeNodes.length;
        treeNodes.push({
            id: newNodeId,
            isLeaf: false,
            movieIdx: null,
            label: `Cluster #${newNodeId}`,
            left: clusterA.nodeId,
            right: clusterB.nodeId,
            height: bestDist,
            leaves: combinedLeaves,
        });

        active.splice(bestJ, 1);
        active.splice(bestI, 1);
        active.push({
            nodeId: newNodeId,
            leaves: combinedLeaves,
        });

        steps.push({
            step,
            distance: bestDist,
            mergedA: clusterA.leaves.map((idx) => movies[idx].movie),
            mergedB: clusterB.leaves.map((idx) => movies[idx].movie),
            clusters: active.map((c) => [...c.leaves]),
        });
    }

    const rootNode = treeNodes[treeNodes.length - 1];
    return { treeNodes, rootNode, steps, proximity };
}

/**
 * Performs bottom-up agglomerative hierarchical clustering cut to a target cluster count or distance threshold.
 *
 * @param {Array<{movie: string, ratings: Array<{person: string, rating: number}>, metadata?: Object}>} dataset - Raw movie ratings dataset.
 * @param {Object} [options={}] - Clustering options.
 * @param {number} [options.targetClusters=18] - Target number of clusters to stop merging at.
 * @param {number} [options.maxDistance=0.85] - Distance threshold beyond which no merges occur.
 * @param {"average"|"single"|"complete"} [options.linkage="average"] - Linkage method.
 * @returns {{userMeans: Object<string, number>, movies: Array<Object>, clusters: Array<{clusterId: number, items: Array<Object>}>}} Clustered movies and statistics.
 */
export function buildMovieClusters(dataset, { targetClusters = 18, maxDistance = 0.85, linkage = "average" } = {}) {
    const { movies, userMeans } = preprocessDataset(dataset);
    const proximityMatrix = computeProximityMatrix(movies);

    let clusters = movies.map((_, idx) => [idx]);

    while (clusters.length > targetClusters) {
        let minDist = Infinity;
        let mergePair = [-1, -1];

        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const dist = clusterDistance(clusters[i], clusters[j], proximityMatrix, linkage);
                if (dist < minDist) {
                    minDist = dist;
                    mergePair = [i, j];
                }
            }
        }

        if (minDist > maxDistance) break;

        const [i, j] = mergePair;
        const merged = [...clusters[i], ...clusters[j]];
        clusters.splice(j, 1);
        clusters.splice(i, 1);
        clusters.push(merged);
    }

    return {
        userMeans,
        movies,
        clusters: clusters.map((indices, id) => ({
            clusterId: id,
            items: indices.map((idx) => movies[idx]),
        })),
    };
}

/**
 * Computes personalized recommendations and anti-recommendations for a reviewer given a specific cluster partitioning.
 * Combines cluster-level preference affinity with peer sentiment and collaborative similarity fallback.
 *
 * @param {string} personName - Name of the target reviewer.
 * @param {Array<Object>} activeMovies - Array of movies active in the current clustering scope.
 * @param {Array<Object>} allMovies - Array of all movies in the complete catalog.
 * @param {Object<string, number>} userMeans - Mean rating of each reviewer.
 * @param {Array<number[]|{items: Array<Object>}>} currentClusters - Array of cluster index arrays or cluster item objects.
 * @throws {Error} If `personName` is not found in `userMeans`.
 * @returns {{person: string, userMean: number, userAverageRating: number, seenCount: number, clusterMeta: Array<{clusterId: number, items: Array<Object>, seenCount: number, affinity: number|null}>, recommendations: Array<{movie: string, score: number, predictedRating: number, source: string, clusterId: number|null}>, antiRecommendations: Array<{movie: string, score: number, predictedRating: number, source: string, clusterId: number|null}>}} Top recommendations, anti-recommendations, and cluster metadata.
 */
export function computeRecommendations(personName, activeMovies, allMovies, userMeans, currentClusters) {
    const userMean = userMeans[personName];
    if (userMean === undefined) {
        throw new Error(`Reviewer "${personName}" not found in dataset.`);
    }

    const seenMovies = new Set(
        allMovies.filter((m) => personName in m.vector).map((m) => m.movie)
    );

    // Build user-to-user taste similarity across all movies for sparse fallback
    const userSimilarities = {};
    for (const otherPerson of Object.keys(userMeans)) {
        if (otherPerson === personName) continue;
        let dot = 0, normA = 0, normB = 0;
        for (const m of allMovies) {
            if (personName in m.vector && otherPerson in m.vector) {
                dot += m.vector[personName] * m.vector[otherPerson];
                normA += m.vector[personName] ** 2;
                normB += m.vector[otherPerson] ** 2;
            }
        }
        userSimilarities[otherPerson] =
            normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    }

    const candidateScores = new Map();
    const clusterMeta = [];

    currentClusters.forEach((clusterEntry, clusterId) => {
        let items = [];
        if (Array.isArray(clusterEntry)) {
            items = clusterEntry.map((x) => (typeof x === "number" ? activeMovies[x] : x)).filter(Boolean);
        } else if (clusterEntry && Array.isArray(clusterEntry.items)) {
            items = clusterEntry.items;
        }

        const seenInCluster = items.filter((m) => m && seenMovies.has(m.movie));
        const unseenInCluster = items.filter((m) => m && !seenMovies.has(m.movie));

        let affinity = null;
        if (seenInCluster.length > 0) {
            affinity =
                seenInCluster.reduce((sum, m) => sum + m.vector[personName], 0) /
                seenInCluster.length;
        }

        clusterMeta.push({
            clusterId,
            items,
            seenCount: seenInCluster.length,
            affinity,
        });

        if (affinity !== null && unseenInCluster.length > 0) {
            for (const unseen of unseenInCluster) {
                const score =
                    affinity >= 0
                        ? affinity + 0.35 * unseen.peerSentiment
                        : affinity - 0.35 * Math.abs(unseen.peerSentiment);

                candidateScores.set(unseen.movie, {
                    movie: unseen.movie,
                    score: Number(score.toFixed(3)),
                    predictedRating: Number(Math.min(10, Math.max(1, userMean + score)).toFixed(1)),
                    source: "cluster",
                    clusterId,
                });
            }
        }
    });

    // Fallback collaborative similarity for any remaining unseen movies
    const fallbackPool = activeMovies.length >= 15 ? activeMovies : allMovies;
    for (const unseen of fallbackPool) {
        if (!unseen || seenMovies.has(unseen.movie) || candidateScores.has(unseen.movie)) continue;

        let weightedSum = 0;
        let simWeightTotal = 0;

        for (const { person } of unseen.rawRatings) {
            const sim = userSimilarities[person] || 0;
            if (Math.abs(sim) > 0.05) {
                weightedSum += sim * unseen.vector[person];
                simWeightTotal += Math.abs(sim);
            }
        }

        const fallbackScore = simWeightTotal > 0 ? weightedSum / simWeightTotal : 0;
        candidateScores.set(unseen.movie, {
            movie: unseen.movie,
            score: Number(fallbackScore.toFixed(3)),
            predictedRating: Number(Math.min(10, Math.max(1, userMean + fallbackScore)).toFixed(1)),
            source: "peer-similarity",
            clusterId: null,
        });
    }

    const ranked = Array.from(candidateScores.values()).sort(
        (a, b) => b.score - a.score
    );

    return {
        person: personName,
        userMean,
        userAverageRating: Number(userMean.toFixed(2)),
        seenCount: seenMovies.size,
        clusterMeta,
        recommendations: ranked.slice(0, 5),
        antiRecommendations: ranked.slice(-5).reverse(), // Worst 5 first
    };
}

/**
 * Returns Top 5 Recommendations & Top 5 Anti-Recommendations for a reviewer using hierarchical clustering.
 *
 * @param {string} personName - Name of the reviewer to evaluate.
 * @param {Array<{movie: string, ratings: Array<{person: string, rating: number}>}>} dataset - Raw movie ratings dataset.
 * @param {Object} [options={}] - Clustering options passed to `buildMovieClusters`.
 * @returns {{person: string, userAverageRating: number, recommendations: Array<{movie: string, score: number, predictedRating: number, source: string, clusterId?: number}>, antiRecommendations: Array<{movie: string, score: number, predictedRating: number, source: string, clusterId?: number}>}} Computed recommendations and anti-recommendations.
 */
export function getRecommendations(personName, dataset, options = {}) {
    const { userMeans, movies, clusters } = buildMovieClusters(dataset, options);
    const recResult = computeRecommendations(personName, movies, movies, userMeans, clusters);

    return {
        person: personName,
        userAverageRating: Number(userMeans[personName].toFixed(2)),
        recommendations: recResult.recommendations,
        antiRecommendations: recResult.antiRecommendations,
    };
}

/**
 * Helper to load a JSON dataset across both modern Browser (fetch) and Node.js (fs) environments.
 * Iterates through candidate paths until a valid dataset is retrieved.
 *
 * @param {string|string[]} [paths=['./enriched_movie_ratings.json', './normalized_movie_ratings.json']] - Candidate file paths or URLs to try.
 * @returns {Promise<Array<Object>|null>} Parsed dataset, or `null` if all paths fail to load.
 */
export async function loadDefaultDataset(paths = ['./enriched_movie_ratings.json', './normalized_movie_ratings.json']) {
    const pathList = Array.isArray(paths) ? paths : [paths];

    for (const path of pathList) {
        try {
            if (typeof window !== 'undefined' && typeof fetch === 'function') {
                const res = await fetch(path);
                if (res.ok) {
                    return await res.json();
                }
            } else if (typeof process !== 'undefined' && process.versions?.node) {
                const fs = await import('node:fs/promises');
                const target = (path.startsWith('./') || path.startsWith('../'))
                    ? new URL(path, import.meta.url)
                    : path;
                const content = await fs.readFile(target, 'utf-8');
                return JSON.parse(content);
            }
        } catch (_) {
            // Try next candidate path
        }
    }
    return null;
}

export { DEFAULT_ENRICHED_DATASET } from './enriched_movie_ratings.js';

// --- CLI Example Usage (only executes when run directly in Node, e.g. `node index.js`) ---
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('index.js')) {
    import('./enriched_movie_ratings.json', { with: { type: 'json' } })
        .catch(() => import('./normalized_movie_ratings.json', { with: { type: 'json' } }))
        .then((module) => {
            const movieData = module.default;
            const result = getRecommendations("Paweł Czapiewski", movieData);
            console.log(result);
        })
        .catch((err) => {
            console.error("Error running CLI example:", err);
        });
}
