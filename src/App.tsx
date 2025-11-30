import { useCallback, useEffect, useState, type JSX } from "react";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Cell = 0 | 1 | 2; // 0: empty, 1: player, 2: bot
type Board = Cell[][];
type Algorithm = "alphabeta" | "transposition" | "mtdf";

interface GameConfig {
	algorithm: Algorithm;
	searchDepth: number;
	playerStarts: boolean;
}

interface PerformanceMetrics {
	nodesSearched: number;
	timeMs: number;
	evaluation: number;
	isThinking: boolean;
}

// ============================================================================
// GAME CONSTANTS
// ============================================================================

const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const BOT = 2;

// ============================================================================
// TRANSPOSITION TABLE TYPES & INSTANCE
// ============================================================================

// Types for transposition table (caching evaluated positions)
type TTFlag = "EXACT" | "LOWERBOUND" | "UPPERBOUND";
interface TTEntry {
	score: number;
	depth: number;
	flag: TTFlag;
}

// Global transposition table for caching positions
const transpositionTable = new Map<string, TTEntry>();

export default function App(): JSX.Element {
	// ========================================================================
	// STATE MANAGEMENT
	// ========================================================================

	const [gameState, setGameState] = useState<
		"setup" | "playing" | "finished"
	>("setup");
	const [board, setBoard] = useState<Board>(createEmptyBoard());
	const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(PLAYER);
	const [winner, setWinner] = useState<0 | 1 | 2>(0);
	const [config, setConfig] = useState<GameConfig>({
		algorithm: "alphabeta",
		searchDepth: 5,
		playerStarts: true,
	});
	const [metrics, setMetrics] = useState<PerformanceMetrics>({
		nodesSearched: 0,
		timeMs: 0,
		evaluation: 0,
		isThinking: false,
	});

	// ========================================================================
	// BOARD STATE HELPERS
	// ========================================================================

	function createEmptyBoard(): Board {
		return Array(ROWS)
			.fill(null)
			.map(() => Array(COLS).fill(0));
	}

	// ========================================================================
	// BOARD VALIDATION FUNCTIONS
	// ========================================================================

	function checkWinner(board: Board): 0 | 1 | 2 {
		// Check horizontal
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				if (
					board[r][c] !== 0 &&
					board[r][c] === board[r][c + 1] &&
					board[r][c] === board[r][c + 2] &&
					board[r][c] === board[r][c + 3]
				) {
					return board[r][c];
				}
			}
		}

		// Check vertical
		for (let r = 0; r < ROWS - 3; r++) {
			for (let c = 0; c < COLS; c++) {
				if (
					board[r][c] !== 0 &&
					board[r][c] === board[r + 1][c] &&
					board[r][c] === board[r + 2][c] &&
					board[r][c] === board[r + 3][c]
				) {
					return board[r][c];
				}
			}
		}

		// Check diagonal (bottom-left to top-right)
		for (let r = 3; r < ROWS; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				if (
					board[r][c] !== 0 &&
					board[r][c] === board[r - 1][c + 1] &&
					board[r][c] === board[r - 2][c + 2] &&
					board[r][c] === board[r - 3][c + 3]
				) {
					return board[r][c];
				}
			}
		}

		// Check diagonal (top-left to bottom-right)
		for (let r = 0; r < ROWS - 3; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				if (
					board[r][c] !== 0 &&
					board[r][c] === board[r + 1][c + 1] &&
					board[r][c] === board[r + 2][c + 2] &&
					board[r][c] === board[r + 3][c + 3]
				) {
					return board[r][c];
				}
			}
		}

		return 0;
	}

	function isValidMove(board: Board, col: number): boolean {
		return board[0][col] === 0;
	}

	function isBoardFull(board: Board): boolean {
		return board[0].every((cell) => cell !== 0);
	}

	// ========================================================================
	// BOARD MANIPULATION FUNCTIONS
	// ========================================================================

	function makeMove(board: Board, col: number, player: 1 | 2): Board {
		const newBoard = board.map((row) => [...row]);
		for (let r = ROWS - 1; r >= 0; r--) {
			if (newBoard[r][col] === 0) {
				newBoard[r][col] = player;

				break;
			}
		}

		return newBoard;
	}

	function getValidMoves(board: Board): number[] {
		const moves: number[] = [];
		for (let c = 0; c < COLS; c++) {
			if (isValidMove(board, c)) {
				moves.push(c);
			}
		}

		return moves;
	}

	// ========================================================================
	// BOARD EVALUATION & HASHING
	// ========================================================================

	function evaluateBoard(board: Board, player: 1 | 2): number {
		const opponent = player === PLAYER ? BOT : PLAYER;
		let score = 0;

		// Helper function to evaluate a window of 4 cells
		const evaluateWindow = (window: Cell[]): number => {
			let windowScore = 0;
			const playerCount = window.filter((c) => c === player).length;
			const opponentCount = window.filter((c) => c === opponent).length;
			const emptyCount = window.filter((c) => c === 0).length;

			// Player pieces scoring
			if (playerCount === 4) {
				windowScore += 100; // Winning position
			} else if (playerCount === 3 && emptyCount === 1) {
				windowScore += 5; // Almost winning
			} else if (playerCount === 2 && emptyCount === 2) {
				windowScore += 2; // Potential
			}

			// Opponent pieces scoring (blocking)
			if (opponentCount === 3 && emptyCount === 1) {
				windowScore -= 4; // Block winning threat
			} else if (opponentCount === 2 && emptyCount === 2) {
				windowScore -= 1; // Block potential
			}

			return windowScore;
		};

		// Evaluate all horizontal windows
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				score += evaluateWindow([
					board[r][c],
					board[r][c + 1],
					board[r][c + 2],
					board[r][c + 3],
				]);
			}
		}

		// Evaluate all vertical windows
		for (let r = 0; r < ROWS - 3; r++) {
			for (let c = 0; c < COLS; c++) {
				score += evaluateWindow([
					board[r][c],
					board[r + 1][c],
					board[r + 2][c],
					board[r + 3][c],
				]);
			}
		}

		// Evaluate all diagonal windows (top-left to bottom-right)
		for (let r = 0; r < ROWS - 3; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				score += evaluateWindow([
					board[r][c],
					board[r + 1][c + 1],
					board[r + 2][c + 2],
					board[r + 3][c + 3],
				]);
			}
		}

		// Evaluate all diagonal windows (bottom-left to top-right)
		for (let r = 3; r < ROWS; r++) {
			for (let c = 0; c < COLS - 3; c++) {
				score += evaluateWindow([
					board[r][c],
					board[r - 1][c + 1],
					board[r - 2][c + 2],
					board[r - 3][c + 3],
				]);
			}
		}

		// Bonus for controlling center column (strategic positioning)
		const centerCol = Math.floor(COLS / 2);
		const centerCount = board.filter(
			(row) => row[centerCol] === player
		).length;

		score += centerCount * 3;

		return score;
	}

	function getBoardHash(board: Board): string {
		return board.map((row) => row.join("")).join("-");
	}

	// ========================================================================
	// MINIMAX SEARCH ALGORITHMS
	// ========================================================================

	/**
	 * Alpha-Beta Pruning Algorithm
	 * Uses minimax with alpha-beta pruning to efficiently search the game tree.
	 * - Alpha: best value the maximizer can guarantee
	 * - Beta: best value the minimizer can guarantee
	 * Pruning reduces nodes by eliminating branches that won't affect the result.
	 */
	function alphaBetaPruningAlgorithm(
		board: Board,
		depth: number,
		alpha: number,
		beta: number,
		maximizing: boolean,
		botPlayer: 1 | 2,
		nodesRef: { count: number }
	): number {
		nodesRef.count++;

		const humanPlayer = botPlayer === BOT ? PLAYER : BOT;

		// Terminal state checks
		const winner = checkWinner(board);
		if (winner === botPlayer) {
			return 10000 + depth; // Bot wins (prefer faster wins)
		}

		if (winner === humanPlayer) {
			return -10000 - depth; // Human wins (avoid slower losses)
		}

		if (depth === 0 || isBoardFull(board)) {
			return evaluateBoard(board, botPlayer);
		}

		const validMoves = getValidMoves(board);

		if (maximizing) {
			// Maximizing player (bot) - tries to maximize score
			let maxEval = -Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, botPlayer);
				const evalScore = alphaBetaPruningAlgorithm(
					newBoard,
					depth - 1,
					alpha,
					beta,
					false, // Next turn is minimizing player
					botPlayer,
					nodesRef
				);

				maxEval = Math.max(maxEval, evalScore);
				alpha = Math.max(alpha, evalScore);

				if (beta <= alpha) {
					break; // Beta cutoff
				}
			}
			return maxEval;
		} else {
			// Minimizing player (human) - tries to minimize score
			let minEval = Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, humanPlayer);
				const evalScore = alphaBetaPruningAlgorithm(
					newBoard,
					depth - 1,
					alpha,
					beta,
					true, // Next turn is maximizing player
					botPlayer,
					nodesRef
				);

				minEval = Math.min(minEval, evalScore);
				beta = Math.min(beta, evalScore);

				if (beta <= alpha) {
					break; // Alpha cutoff
				}
			}

			return minEval;
		}
	}

	/**
	 * Alpha-Beta with Transposition Table
	 * Enhances alpha-beta pruning by caching previously evaluated positions.
	 * - Transposition table stores: score, depth, and bound type (EXACT, LOWERBOUND, UPPERBOUND)
	 * - Properly handles bound types for correctness in transposition lookups
	 * - Hash includes board state and whose turn it is (maximizing vs minimizing)
	 */
	function alphaBetaPruningWithTranspositionTableAlgorithm(
		board: Board,
		depth: number,
		alpha: number,
		beta: number,
		maximizing: boolean,
		botPlayer: 1 | 2,
		nodesRef: { count: number }
	): number {
		nodesRef.count++;

		const alphaOrig = alpha;
		const humanPlayer = botPlayer === BOT ? PLAYER : BOT;

		// Transposition table lookup - include maximizing state in hash
		// Same position can have different values depending on whose turn it is
		const hash = getBoardHash(board) + "-" + (maximizing ? "max" : "min");
		const cached = transpositionTable.get(hash);
		if (cached && cached.depth >= depth) {
			// Use cached value based on bound type
			if (cached.flag === "EXACT") {
				return cached.score;
			} else if (cached.flag === "LOWERBOUND") {
				alpha = Math.max(alpha, cached.score);
			} else if (cached.flag === "UPPERBOUND") {
				beta = Math.min(beta, cached.score);
			}

			if (alpha >= beta) {
				return cached.score;
			}
		}

		// Terminal state checks
		const winner = checkWinner(board);
		if (winner === botPlayer) {
			return 10000 + depth;
		}

		if (winner === humanPlayer) {
			return -10000 - depth;
		}

		if (depth === 0 || isBoardFull(board)) {
			return evaluateBoard(board, botPlayer);
		}

		const validMoves = getValidMoves(board);
		// Save original beta for flag determination (beta may be modified during search)
		const betaOrig = beta;
		let score: number;

		if (maximizing) {
			// Maximizing player (bot)
			let maxEval = -Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, botPlayer);
				const evalScore =
					alphaBetaPruningWithTranspositionTableAlgorithm(
						newBoard,
						depth - 1,
						alpha,
						beta,
						false,
						botPlayer,
						nodesRef
					);

				maxEval = Math.max(maxEval, evalScore);
				alpha = Math.max(alpha, evalScore);

				if (beta <= alpha) {
					break; // Beta cutoff
				}
			}

			score = maxEval;
		} else {
			// Minimizing player (human)
			let minEval = Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, humanPlayer);
				const evalScore =
					alphaBetaPruningWithTranspositionTableAlgorithm(
						newBoard,
						depth - 1,
						alpha,
						beta,
						true,
						botPlayer,
						nodesRef
					);

				minEval = Math.min(minEval, evalScore);
				beta = Math.min(beta, evalScore);

				if (beta <= alpha) {
					break; // Alpha cutoff
				}
			}

			score = minEval;
		}

		// Store in transposition table with appropriate flag
		// - UPPERBOUND: score is at most this value (failed low)
		// - LOWERBOUND: score is at least this value (failed high)
		// - EXACT: score is the exact minimax value
		let flag: TTFlag;
		if (score <= alphaOrig) {
			flag = "UPPERBOUND";
		} else if (score >= betaOrig) {
			flag = "LOWERBOUND";
		} else {
			flag = "EXACT";
		}

		transpositionTable.set(hash, { score, depth, flag });

		return score;
	}

	/**
	 * Alpha-Beta Memory for MTD(f)
	 * A negamax formulation with transposition table bounds.
	 * Stores bounds for null-window searches used by MTD(f).
	 * Includes current player in hash to distinguish between players.
	 */
	function alphaBetaPruningWithMemoryAlgorithm(
		board: Board,
		depth: number,
		alpha: number,
		beta: number,
		currentPlayer: 1 | 2,
		botPlayer: 1 | 2,
		nodesRef: { count: number }
	): number {
		nodesRef.count++;

		const alphaOrig = alpha;
		const hash = getBoardHash(board) + "-" + currentPlayer; // Include current player in hash
		const cached = transpositionTable.get(hash);

		// Transposition table lookup with proper bound handling
		if (cached && cached.depth >= depth) {
			if (cached.flag === "EXACT") {
				return cached.score;
			} else if (cached.flag === "LOWERBOUND") {
				alpha = Math.max(alpha, cached.score);
			} else if (cached.flag === "UPPERBOUND") {
				beta = Math.min(beta, cached.score);
			}

			if (alpha >= beta) {
				return cached.score;
			}
		}

		const opponent = currentPlayer === PLAYER ? BOT : PLAYER;

		// Terminal state checks (from perspective of botPlayer)
		const winner = checkWinner(board);
		if (winner === botPlayer) {
			return 10000 + depth;
		}

		if (winner !== 0 && winner !== botPlayer) {
			return -10000 - depth;
		}

		if (depth === 0 || isBoardFull(board)) {
			return evaluateBoard(board, botPlayer);
		}

		const validMoves = getValidMoves(board);
		// Save original beta for flag determination
		const betaOrig = beta;
		let bestScore: number;

		if (currentPlayer === botPlayer) {
			// Maximizing for bot
			bestScore = -Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, currentPlayer);
				const score = alphaBetaPruningWithMemoryAlgorithm(
					newBoard,
					depth - 1,
					alpha,
					beta,
					opponent,
					botPlayer,
					nodesRef
				);

				bestScore = Math.max(bestScore, score);
				alpha = Math.max(alpha, bestScore);

				if (alpha >= beta) {
					break;
				}
			}
		} else {
			// Minimizing for opponent
			bestScore = Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, currentPlayer);
				const score = alphaBetaPruningWithMemoryAlgorithm(
					newBoard,
					depth - 1,
					alpha,
					beta,
					opponent,
					botPlayer,
					nodesRef
				);

				bestScore = Math.min(bestScore, score);
				beta = Math.min(beta, bestScore);

				if (alpha >= beta) {
					break;
				}
			}
		}

		// Store in transposition table with appropriate bound flag
		// - UPPERBOUND: score is at most this value (failed low)
		// - LOWERBOUND: score is at least this value (failed high)
		// - EXACT: score is the exact minimax value
		let flag: TTFlag;
		if (bestScore <= alphaOrig) {
			flag = "UPPERBOUND";
		} else if (bestScore >= betaOrig) {
			flag = "LOWERBOUND";
		} else {
			flag = "EXACT";
		}

		transpositionTable.set(hash, { score: bestScore, depth, flag });

		return bestScore;
	}

	/**
	 * MTD(f) Algorithm - Memory-enhanced Test Driver with first guess
	 * Uses null-window searches centered around a guess to converge on the true minimax value.
	 * More efficient than standard alpha-beta when combined with transposition tables.
	 * Iteratively narrows the search window until the exact value is found.
	 */
	function mtdfAlgorithm(
		board: Board,
		depth: number,
		firstGuess: number,
		currentPlayer: 1 | 2,
		botPlayer: 1 | 2,
		nodesRef: { count: number }
	): number {
		let g = firstGuess;
		let lowerBound = -Infinity;
		let upperBound = Infinity;

		// Iteratively narrow the window until we converge on the exact value
		while (lowerBound < upperBound) {
			// Use a null-window (zero-width window) centered around our guess
			const beta = Math.max(g, lowerBound + 1);

			// Perform a null-window search
			g = alphaBetaPruningWithMemoryAlgorithm(
				board,
				depth,
				beta - 1,
				beta,
				currentPlayer,
				botPlayer,
				nodesRef
			);

			// Update bounds based on result
			if (g < beta) {
				upperBound = g;
			} else {
				lowerBound = g;
			}
		}

		return g;
	}

	function findBestMove(
		board: Board,
		algorithm: Algorithm,
		depth: number
	): { col: number; evaluation: number; nodes: number } {
		const validMoves = getValidMoves(board);
		let bestCol = validMoves[0];
		let bestScore = -Infinity;
		const nodesRef = { count: 0 };

		// ====================================================================
		// MOVE SEARCH BY ALGORITHM TYPE
		// ====================================================================

		if (algorithm === "mtdf") {
			// MTD(f) with iterative deepening
			// Start with a guess of 0 and refine through iterative deepening
			let firstGuess = 0;

			for (let d = 1; d <= depth; d++) {
				let tempBestScore = -Infinity;
				let tempBestCol = validMoves[0];

				for (const col of validMoves) {
					const newBoard = makeMove(board, col, BOT);
					// After BOT moves, it's PLAYER's turn to move
					const score = mtdfAlgorithm(
						newBoard,
						d - 1,
						firstGuess,
						PLAYER, // Current player after this move
						BOT, // We're evaluating for BOT
						nodesRef
					);

					if (score > tempBestScore) {
						tempBestScore = score;
						tempBestCol = col;
					}
				}

				bestScore = tempBestScore;
				bestCol = tempBestCol;
				firstGuess = tempBestScore; // Use this depth's result as next guess
			}
		} else {
			// Alpha-Beta or Alpha-Beta with Transposition Table
			const useTransposition = algorithm === "transposition";

			for (const col of validMoves) {
				const newBoard = makeMove(board, col, BOT);
				// After BOT moves, it's PLAYER's turn (minimizing)
				const score = useTransposition
					? alphaBetaPruningWithTranspositionTableAlgorithm(
							newBoard,
							depth - 1,
							-Infinity,
							Infinity,
							false, // PLAYER is minimizing
							BOT, // We're evaluating for BOT
							nodesRef
					  )
					: alphaBetaPruningAlgorithm(
							newBoard,
							depth - 1,
							-Infinity,
							Infinity,
							false, // PLAYER is minimizing
							BOT, // We're evaluating for BOT
							nodesRef
					  );

				if (score > bestScore) {
					bestScore = score;
					bestCol = col;
				}
			}
		}

		return {
			col: bestCol,
			evaluation: bestScore,
			nodes: nodesRef.count,
		};
	}

	// ========================================================================
	// GAME EVENT HANDLERS
	// ========================================================================

	const handlePlayerMove = (col: number) => {
		if (
			gameState !== "playing" ||
			currentPlayer !== PLAYER ||
			!isValidMove(board, col)
		) {
			return;
		}

		const newBoard = makeMove(board, col, PLAYER);
		setBoard(newBoard);

		const winner = checkWinner(newBoard);
		if (winner) {
			setWinner(winner);
			setGameState("finished");

			return;
		}

		if (isBoardFull(newBoard)) {
			setGameState("finished");

			return;
		}

		setCurrentPlayer(BOT);
	};

	const makeBotMove = useCallback(async () => {
		if (currentPlayer !== BOT || gameState !== "playing") return;

		setMetrics((prev) => ({ ...prev, isThinking: true, nodesSearched: 0 }));

		// Simulate thinking with delay
		await new Promise((resolve) => setTimeout(resolve, 50));

		const startTime = performance.now();
		const { col, evaluation, nodes } = findBestMove(
			board,
			config.algorithm,
			config.searchDepth
		);
		const endTime = performance.now();

		const thinkTime = endTime - startTime;

		setMetrics({
			nodesSearched: nodes,
			timeMs: thinkTime,
			evaluation,
			isThinking: true,
		});

		const newBoard = makeMove(board, col, BOT);
		setBoard(newBoard);
		setMetrics((prev) => ({
			...prev,
			isThinking: false,
		}));

		const winner = checkWinner(newBoard);
		if (winner) {
			setWinner(winner);
			setGameState("finished");

			return;
		}

		if (isBoardFull(newBoard)) {
			setGameState("finished");

			return;
		}

		setCurrentPlayer(PLAYER);
	}, [currentPlayer, gameState, board, config]);

	// ========================================================================
	// GAME LIFECYCLE EFFECTS
	// ========================================================================

	useEffect(() => {
		if (currentPlayer === BOT && gameState === "playing") {
			makeBotMove();
		}
	}, [currentPlayer, gameState, makeBotMove]);

	// ========================================================================
	// GAME STATE INITIALIZATION
	// ========================================================================

	const startGame = () => {
		const newBoard = createEmptyBoard();
		setBoard(newBoard);
		setWinner(0);
		setGameState("playing");
		setCurrentPlayer(config.playerStarts ? PLAYER : BOT);
		setMetrics({
			nodesSearched: 0,
			timeMs: 0,
			evaluation: 0,
			isThinking: false,
		});

		transpositionTable.clear();
	};

	const restartGame = () => {
		setGameState("setup");
		setBoard(createEmptyBoard());
		setWinner(0);
		setMetrics({
			nodesSearched: 0,
			timeMs: 0,
			evaluation: 0,
			isThinking: false,
		});

		transpositionTable.clear();
	};

	// ========================================================================
	// RENDER: SETUP SCREEN
	// ========================================================================

	if (gameState === "setup") {
		return (
			<div className="min-h-screen bg-linear-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4 sm:p-8">
				<div className="bg-white rounded-2xl shadow-2xl px-4 py-8 sm:p-8 max-w-5xl w-full">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						{/* Left Column: Game Configuration */}
						<div className="space-y-5">
							<h2 className="text-2xl font-bold text-slate-800 mb-6">
								Connect 4 AI Game
							</h2>

							{/* Algorithm Selection */}
							<div>
								<label className="block text-sm font-medium text-slate-700 mb-2">
									AI Algorithm
								</label>

								<select
									value={config.algorithm}
									onChange={(e) =>
										setConfig({
											...config,
											algorithm: e.target
												.value as Algorithm,
										})
									}
									className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								>
									<option value="alphabeta">
										Alpha-Beta Pruning
									</option>

									<option value="transposition">
										Transposition Table
									</option>

									<option value="mtdf">MTD(f)</option>
								</select>
							</div>

							{/* Search Depth Selection */}
							<div>
								<label className="block text-sm font-medium text-slate-700 mb-2">
									Search Depth: {config.searchDepth}
								</label>

								<input
									type="range"
									min="1"
									max="10"
									value={config.searchDepth}
									onChange={(e) =>
										setConfig({
											...config,
											searchDepth: Number(e.target.value),
										})
									}
									className="w-full"
								/>

								<div className="flex justify-between text-xs text-slate-500 mt-1">
									<span>1 (Easy)</span>

									<span>10 (Hard)</span>
								</div>
							</div>

							{/* Player Start Selection */}
							<div>
								<label className="block text-sm font-medium text-slate-700 mb-2">
									Who Starts First?
								</label>

								<div className="flex gap-4">
									<button
										onClick={() =>
											setConfig({
												...config,
												playerStarts: true,
											})
										}
										className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
											config.playerStarts
												? "bg-blue-500 text-white"
												: "bg-slate-200 text-slate-700 hover:bg-slate-300"
										}`}
									>
										Player
									</button>

									<button
										onClick={() =>
											setConfig({
												...config,
												playerStarts: false,
											})
										}
										className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
											!config.playerStarts
												? "bg-red-500 text-white"
												: "bg-slate-200 text-slate-700 hover:bg-slate-300"
										}`}
									>
										Bot
									</button>
								</div>
							</div>

							{/* Start Button */}
							<button
								onClick={startGame}
								className="w-full bg-linear-to-r from-blue-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition shadow-lg"
							>
								Start Game
							</button>
						</div>

						{/* Right Column: Project Information */}
						<div className="space-y-5 border-slate-200 border-t-2 sm:border-t-0 sm:border-l-2 pt-8 sm:pt-0 sm:pl-8">
							<h2 className="text-2xl font-bold text-slate-800 mb-6">
								Project Information
							</h2>

							{/* Title */}
							<div>
								<h3 className="font-bold text-slate-800 text-sm">
									Title
								</h3>

								<p className="text-slate-600 text-sm leading-relaxed text-justify">
									Implementation and Comparative Study of
									Alpha-Beta Pruning, Transposition Tables,
									and MTD(F) for Minimax Algorithm in a
									Two-Player Connect Four Game
								</p>
							</div>

							{/* Course */}
							<div>
								<h3 className="font-bold text-slate-800 text-sm">
									Course
								</h3>

								<p className="text-slate-600 text-sm">
									Introduction to Artificial Intelligence -
									Class A
								</p>
							</div>

							{/* Lecturer */}
							<div>
								<h3 className="font-bold text-slate-800 text-sm">
									Lecturer
								</h3>

								<p className="text-slate-600 text-sm">
									Bima Prihasto, S.Si., M.Si., Ph.D.
								</p>
							</div>

							{/* Members */}
							<div>
								<h3 className="font-bold text-slate-800 text-sm">
									Group 8 Members
								</h3>

								<ul className="text-slate-600 ml-4 space-y-1 text-sm list-disc">
									<li>
										11231001 - Abdullah Adiwarman Wildan
									</li>

									<li>11231015 - Bagus Nur Ardiansyah</li>

									<li>11231089 - Rizky Irswanda Ramadhana</li>

									<li>11231092 - Zakaria Fattawari</li>

									<li>11241041 - Lisa Sapitri</li>
								</ul>
							</div>

							{/* GitHub Repository */}
							<div>
								<a
									href="https://github.com/NotHydra/connect-4-game"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold text-sm"
								>
									<span>🔗 GitHub Repository</span>
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// ========================================================================
	// RENDER: GAME PLAYING SCREEN
	// ========================================================================

	return (
		<div className="min-h-screen bg-linear-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
			<div className="max-w-6xl mx-auto">
				{/* Header Section */}
				<div className="text-center mb-6">
					<h1 className="text-4xl font-bold text-white mb-2">
						Connect 4
					</h1>

					<p className="text-slate-300">
						Algorithm:{" "}
						<span className="font-semibold">
							{config.algorithm === "alphabeta"
								? "Alpha-Beta Pruning"
								: config.algorithm === "transposition"
								? "Transposition Table"
								: "MTD(f)"}
						</span>
					</p>

					<p className="text-slate-300">
						Depth:{" "}
						<span className="font-semibold">
							{config.searchDepth}
						</span>
					</p>
				</div>

				{/* Game Status Messages */}
				{winner !== 0 && (
					<div
						className={`mb-6 p-4 rounded-lg text-center font-bold text-lg ${
							winner === PLAYER
								? "bg-blue-500 text-white"
								: "bg-red-500 text-white"
						}`}
					>
						{winner === PLAYER ? "🎉 You Win!" : "🤖 Bot Wins!"}
					</div>
				)}

				{!winner && isBoardFull(board) && (
					<div className="mb-6 p-4 rounded-lg text-center font-bold text-lg bg-yellow-500 text-white">
						🤝 It's a Draw!
					</div>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* ============================================================== */}
					{/* LEFT: GAME BOARD SECTION */}
					{/* ============================================================== */}
					<div className="lg:col-span-2">
						<div className="bg-blue-600 rounded-2xl p-6 shadow-2xl">
							<div className="grid grid-cols-7 gap-2">
								{board.map((row, r) =>
									row.map((cell, c) => (
										<button
											key={`${r}-${c}`}
											onClick={() => handlePlayerMove(c)}
											disabled={
												currentPlayer !== PLAYER ||
												gameState === "finished"
											}
											className={`aspect-square rounded-full transition ${
												cell === 0
													? "bg-white hover:bg-blue-100 cursor-pointer"
													: cell === PLAYER
													? "bg-blue-400 shadow-inner"
													: "bg-red-400 shadow-inner"
											} ${
												currentPlayer !== PLAYER ||
												gameState === "finished"
													? "cursor-not-allowed"
													: ""
											}`}
										/>
									))
								)}
							</div>
						</div>
					</div>

					{/* ============================================================== */}
					{/* RIGHT: PERFORMANCE METRICS & TURN INDICATOR */}
					{/* ============================================================== */}
					<div className="space-y-4">
						{/* Performance Metrics Card */}
						<div className="bg-white rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-bold text-slate-800 mb-4">
								Performance Metrics
							</h2>

							{/* Bot Thinking Indicator */}
							{metrics.isThinking && (
								<div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
									<div className="flex items-center gap-2">
										<div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full" />

										<span className="text-sm font-medium text-yellow-700">
											Bot is thinking...
										</span>
									</div>
								</div>
							)}

							{/* Metrics Display */}
							<div className="space-y-3">
								<div className="p-3 bg-slate-50 rounded-lg">
									<div className="text-sm text-slate-600">
										Nodes Searched
									</div>

									<div className="text-2xl font-bold text-slate-800">
										{metrics.nodesSearched.toLocaleString()}
									</div>
								</div>

								<div className="p-3 bg-slate-50 rounded-lg">
									<div className="text-sm text-slate-600">
										Time Taken
									</div>

									<div className="text-2xl font-bold text-slate-800">
										{metrics.timeMs.toFixed(0)}ms
									</div>
								</div>

								<div className="p-3 bg-slate-50 rounded-lg">
									<div className="text-sm text-slate-600">
										Evaluation Score
									</div>

									<div className="text-2xl font-bold text-slate-800">
										{metrics.evaluation}
									</div>
								</div>
							</div>
						</div>

						{/* Current Turn Card */}
						<div className="bg-white rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-bold text-slate-800 mb-2">
								Current Turn
							</h2>

							<div
								className={`p-4 rounded-lg text-center font-semibold ${
									currentPlayer === PLAYER
										? "bg-blue-100 text-blue-700"
										: "bg-red-100 text-red-700"
								}`}
							>
								{currentPlayer === PLAYER
									? "🎮 Your Turn"
									: "🤖 Bot's Turn"}
							</div>
						</div>

						{/* New Game Card */}
						<div className="bg-white rounded-xl shadow-lg p-6">
							<button
								onClick={restartGame}
								className="p-4 rounded-lg text-center font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition w-full cursor-pointer"
							>
								New Game
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
