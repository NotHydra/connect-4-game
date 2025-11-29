import { useCallback, useEffect, useState, type JSX } from "react";

type Cell = 0 | 1 | 2; // 0: empty, 1: player, 2: bot
type Board = Cell[][];
type Algorithm = "alphabeta" | "transposition" | "mtdf";

interface GameConfig {
	algorithm: Algorithm;
	searchDepth: number;
	botDelay: number;
	playerStarts: boolean;
}

interface PerformanceMetrics {
	nodesSearched: number;
	timeMs: number;
	evaluation: number;
	isThinking: boolean;
}

const ROWS = 6;
const COLS = 7;
const PLAYER = 1;
const BOT = 2;

// Transposition table for caching
const transpositionTable = new Map<string, { score: number; depth: number }>();

export default function App(): JSX.Element {
	const [gameState, setGameState] = useState<
		"setup" | "playing" | "finished"
	>("setup");
	const [board, setBoard] = useState<Board>(createEmptyBoard());
	const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(PLAYER);
	const [winner, setWinner] = useState<0 | 1 | 2>(0);
	const [config, setConfig] = useState<GameConfig>({
		algorithm: "alphabeta",
		searchDepth: 5,
		botDelay: 500,
		playerStarts: true,
	});
	const [metrics, setMetrics] = useState<PerformanceMetrics>({
		nodesSearched: 0,
		timeMs: 0,
		evaluation: 0,
		isThinking: false,
	});

	function createEmptyBoard(): Board {
		return Array(ROWS)
			.fill(null)
			.map(() => Array(COLS).fill(0));
	}

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

	function isBoardFull(board: Board): boolean {
		return board[0].every((cell) => cell !== 0);
	}

	function evaluateBoard(board: Board, player: 1 | 2): number {
		const opponent = player === PLAYER ? BOT : PLAYER;
		let score = 0;

		// Check all possible windows of 4
		const evaluateWindow = (window: Cell[]): number => {
			let windowScore = 0;
			const playerCount = window.filter((c) => c === player).length;
			const opponentCount = window.filter((c) => c === opponent).length;
			const emptyCount = window.filter((c) => c === 0).length;

			if (playerCount === 4) windowScore += 100;
			else if (playerCount === 3 && emptyCount === 1) windowScore += 5;
			else if (playerCount === 2 && emptyCount === 2) windowScore += 2;

			if (opponentCount === 3 && emptyCount === 1) windowScore -= 4;
			else if (opponentCount === 2 && emptyCount === 2) windowScore -= 1;

			return windowScore;
		};

		// Horizontal
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

		// Vertical
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

		// Diagonal
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

		// Center column preference
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

	// Alpha-Beta Pruning Algorithm
	function alphaBeta(
		board: Board,
		depth: number,
		alpha: number,
		beta: number,
		maximizing: boolean,
		player: 1 | 2,
		nodesRef: { count: number }
	): number {
		nodesRef.count++;

		const winner = checkWinner(board);
		if (winner === player) return 10000 + depth;
		if (winner === (player === PLAYER ? BOT : PLAYER))
			return -10000 - depth;
		if (depth === 0 || isBoardFull(board))
			return evaluateBoard(board, player);

		const validMoves = getValidMoves(board);

		if (maximizing) {
			let maxEval = -Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, player);
				const evalScore = alphaBeta(
					newBoard,
					depth - 1,
					alpha,
					beta,
					false,
					player,
					nodesRef
				);
				maxEval = Math.max(maxEval, evalScore);
				alpha = Math.max(alpha, evalScore);
				if (beta <= alpha) break;
			}
			return maxEval;
		} else {
			let minEval = Infinity;
			const opponent = player === PLAYER ? BOT : PLAYER;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, opponent);
				const evalScore = alphaBeta(
					newBoard,
					depth - 1,
					alpha,
					beta,
					true,
					player,
					nodesRef
				);
				minEval = Math.min(minEval, evalScore);
				beta = Math.min(beta, evalScore);
				if (beta <= alpha) break;
			}
			return minEval;
		}
	}

	// Alpha-Beta with Transposition Table
	function alphaBetaWithTT(
		board: Board,
		depth: number,
		alpha: number,
		beta: number,
		maximizing: boolean,
		player: 1 | 2,
		nodesRef: { count: number }
	): number {
		nodesRef.count++;

		const hash = getBoardHash(board);
		const cached = transpositionTable.get(hash);
		if (cached && cached.depth >= depth) {
			return cached.score;
		}

		const winner = checkWinner(board);
		if (winner === player) return 10000 + depth;
		if (winner === (player === PLAYER ? BOT : PLAYER))
			return -10000 - depth;
		if (depth === 0 || isBoardFull(board))
			return evaluateBoard(board, player);

		const validMoves = getValidMoves(board);

		let score: number;
		if (maximizing) {
			let maxEval = -Infinity;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, player);
				const evalScore = alphaBetaWithTT(
					newBoard,
					depth - 1,
					alpha,
					beta,
					false,
					player,
					nodesRef
				);
				maxEval = Math.max(maxEval, evalScore);
				alpha = Math.max(alpha, evalScore);
				if (beta <= alpha) break;
			}
			score = maxEval;
		} else {
			let minEval = Infinity;
			const opponent = player === PLAYER ? BOT : PLAYER;
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, opponent);
				const evalScore = alphaBetaWithTT(
					newBoard,
					depth - 1,
					alpha,
					beta,
					true,
					player,
					nodesRef
				);
				minEval = Math.min(minEval, evalScore);
				beta = Math.min(beta, evalScore);
				if (beta <= alpha) break;
			}
			score = minEval;
		}

		transpositionTable.set(hash, { score, depth });
		return score;
	}

	// MTD(f) Algorithm
	function mtdf(
		board: Board,
		depth: number,
		firstGuess: number,
		player: 1 | 2,
		nodesRef: { count: number }
	): number {
		let g = firstGuess;
		let upperBound = Infinity;
		let lowerBound = -Infinity;

		while (lowerBound < upperBound) {
			const beta = Math.max(g, lowerBound + 1);
			g = alphaBetaWithTT(
				board,
				depth,
				beta - 1,
				beta,
				true,
				player,
				nodesRef
			);

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

		if (algorithm === "mtdf") {
			const scores: number[] = [];
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, BOT);
				const score = mtdf(newBoard, depth - 1, 0, BOT, nodesRef);
				scores.push(score);
				if (score > bestScore) {
					bestScore = score;
					bestCol = col;
				}
			}
		} else {
			const useTransposition = algorithm === "transposition";
			for (const col of validMoves) {
				const newBoard = makeMove(board, col, BOT);
				const score = useTransposition
					? alphaBetaWithTT(
							newBoard,
							depth - 1,
							-Infinity,
							Infinity,
							false,
							BOT,
							nodesRef
					  )
					: alphaBeta(
							newBoard,
							depth - 1,
							-Infinity,
							Infinity,
							false,
							BOT,
							nodesRef
					  );

				if (score > bestScore) {
					bestScore = score;
					bestCol = col;
				}
			}
		}

		return { col: bestCol, evaluation: bestScore, nodes: nodesRef.count };
	}

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

		// Apply configured delay
		const remainingDelay = Math.max(0, config.botDelay - thinkTime);

		setMetrics({
			nodesSearched: nodes,
			timeMs: thinkTime,
			evaluation,
			isThinking: true,
		});

		await new Promise((resolve) => setTimeout(resolve, remainingDelay));

		const newBoard = makeMove(board, col, BOT);
		setBoard(newBoard);
		setMetrics((prev) => ({ ...prev, isThinking: false }));

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

	useEffect(() => {
		if (currentPlayer === BOT && gameState === "playing") {
			makeBotMove();
		}
	}, [currentPlayer, gameState, makeBotMove]);

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

	if (gameState === "setup") {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-8">
				<div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
					<h1 className="text-3xl font-bold text-slate-800 mb-8 text-center">
						Connect 4 AI
					</h1>

					<div className="space-y-6">
						<div>
							<label className="block text-sm font-medium text-slate-700 mb-2">
								AI Algorithm
							</label>
							<select
								value={config.algorithm}
								onChange={(e) =>
									setConfig({
										...config,
										algorithm: e.target.value as Algorithm,
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

						<div>
							<label className="block text-sm font-medium text-slate-700 mb-2">
								Bot Delay: {config.botDelay}ms
							</label>
							<input
								type="range"
								min="0"
								max="1000"
								step="100"
								value={config.botDelay}
								onChange={(e) =>
									setConfig({
										...config,
										botDelay: Number(e.target.value),
									})
								}
								className="w-full"
							/>
							<div className="flex justify-between text-xs text-slate-500 mt-1">
								<span>0ms (Instant)</span>
								<span>1000ms</span>
							</div>
						</div>

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

						<button
							onClick={startGame}
							className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition shadow-lg"
						>
							Start Game
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
			<div className="max-w-6xl mx-auto">
				<div className="text-center mb-6">
					<h1 className="text-4xl font-bold text-white mb-2">
						Connect 4 AI
					</h1>
					<p className="text-slate-300">
						Algorithm:{" "}
						<span className="font-semibold">
							{config.algorithm === "alphabeta"
								? "Alpha-Beta Pruning"
								: config.algorithm === "transposition"
								? "Transposition Table"
								: "MTD(f)"}
						</span>{" "}
						| Depth: {config.searchDepth}
					</p>
				</div>

				{/* Winner Banner */}
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
					{/* Game Board */}
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

						<div className="mt-4 flex justify-center">
							<button
								onClick={restartGame}
								className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-medium transition"
							>
								New Game
							</button>
						</div>
					</div>

					{/* Performance Metrics */}
					<div className="space-y-4">
						<div className="bg-white rounded-xl shadow-lg p-6">
							<h2 className="text-xl font-bold text-slate-800 mb-4">
								Performance Metrics
							</h2>

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
					</div>
				</div>
			</div>
		</div>
	);
}
