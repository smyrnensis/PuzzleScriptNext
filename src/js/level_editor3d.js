if (typeof levelEditor3DSlice === "undefined")
	var levelEditor3DSlice=0;

function is3DLevelEditorActive() {
	return !!(levelEditorOpened
		&& isCurrentLevelEditor3D()
		&& typeof puzzle3DSession !== "undefined"
		&& puzzle3DSession
		&& puzzle3DSession.runtime
		&& puzzle3DSession.runtime.board);
}

function isCurrentLevelEditor3D() {
	const levels = getInputOutputLevels();
	const level = levels && levels[curLevelNo];
	return !!(level && level.is3d);
}

function getLevelEditor3DBoard() {
	if (!is3DLevelEditorActive())
		return null;
	return puzzle3DSession.runtime.board;
}

function clampLevelEditor3DSlice() {
	const board = getLevelEditor3DBoard();
	if (!board)
		return 0;
	levelEditor3DSlice = Math.max(0, Math.min(levelEditor3DSlice || 0, board.height - 1));
	return levelEditor3DSlice;
}

function getLevelEditorExtraTopRows() {
	return is3DLevelEditorActive() ? 1 : 0;
}

function getLevelEditor3DViewLevel() {
	const board = getLevelEditor3DBoard();
	if (!board)
		return curLevel;
	const slice = clampLevelEditor3DSlice();
	return {
		isLevelEditor3DView: true,
		width: board.width,
		height: board.depth,
		n_tiles: board.width * board.depth,
		layerCount: board.layerCount,
		getCell(index) {
			const x = (index / board.depth) | 0;
			const z = index % board.depth;
			return new BitVec(board.getCell(board.coordToIndex(x, slice, z)));
		},
		getCellInto(index, target) {
			const x = (index / board.depth) | 0;
			const z = index % board.depth;
			return board.getCellInto(board.coordToIndex(x, slice, z), target || new BitVec(STRIDE_OBJ));
		},
		setCell(index, cell) {
			const x = (index / board.depth) | 0;
			const z = index % board.depth;
			setLevelEditor3DCell(x, z, cell);
		}
	};
}

function getPuzzle3DPlayHostForEditor() {
	if (typeof Puzzle3DPlayHost !== "undefined")
		return Puzzle3DPlayHost;
	if (typeof window !== "undefined" && window.Puzzle3DPlayHost)
		return window.Puzzle3DPlayHost;
	if (typeof globalThis !== "undefined" && globalThis.Puzzle3DPlayHost)
		return globalThis.Puzzle3DPlayHost;
	return null;
}

function prepareLevelEditorForCurrentLevel() {
	if (!isCurrentLevelEditor3D())
		return false;
	const host = getPuzzle3DPlayHostForEditor();
	if (host && typeof host.openLevelEditor === "function")
		return host.openLevelEditor(state, curLevelNo);
	if (host && typeof host.showEditorCanvas === "function")
		host.showEditorCanvas();
	clampLevelEditor3DSlice();
	return true;
}

function setLevelEditor3DSlice(delta) {
	const board = getLevelEditor3DBoard();
	if (!board)
		return;
	levelEditor3DSlice = Math.max(0, Math.min(levelEditor3DSlice + delta, board.height - 1));
	canvasResize();
}

function drawLevelEditor3DSliceControls(ctx, xoffset, yoffset, cellwidth, cellheight) {
	const board = getLevelEditor3DBoard();
	if (!board)
		return;
	const rowY = yoffset - 2 * cellheight;
	const prevX = xoffset;
	const nextX = xoffset + (screenwidth - 3) * cellwidth;
	const rightX = xoffset + (screenwidth - 2) * cellwidth;
	if (mouseCoordY === -2 && mouseCoordX === -1)
		ctx.drawImage(glyphMouseOver, xoffset - cellwidth, rowY);
	if (mouseCoordY === -2 && mouseCoordX === 0)
		ctx.drawImage(glyphMouseOver, prevX, rowY);
	if (mouseCoordY === -2 && mouseCoordX === screenwidth - 3)
		ctx.drawImage(glyphMouseOver, nextX, rowY);
	if (mouseCoordY === -2 && mouseCoordX === screenwidth - 2)
		ctx.drawImage(glyphMouseOver, rightX, rowY);
	ctx.fillStyle = state.fgcolor;
	ctx.font = Math.max(10, Math.floor(cellheight * 0.55)) + 'px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText("+", xoffset - cellwidth / 2, rowY + cellheight / 2);
	ctx.fillText("<", prevX + cellwidth / 2, rowY + cellheight / 2);
	ctx.fillText(">", nextX + cellwidth / 2, rowY + cellheight / 2);
	ctx.fillText("+", rightX + cellwidth / 2, rowY + cellheight / 2);
	ctx.fillText((clampLevelEditor3DSlice() + 1) + "/" + board.height,
		xoffset + (screenwidth - 2) * cellwidth / 2,
		rowY + cellheight / 2);
}

function buildPrintableGlyphMasks() {
	var glyphMasks = [];
	for (var glyphName in state.glyphDict) {
		if (state.glyphDict.hasOwnProperty(glyphName)&&glyphName.length===1) {
			var glyph = state.glyphDict[glyphName];
			var glyphmask=new BitVec(STRIDE_OBJ);
			for (var i=0;i<glyph.length;i++)
			{
				var id = glyph[i];
				if (id>=0) {
					glyphmask.ibitset(id);
				}
			}
			var glyphbits = glyphmask.clone();
			var bgMask = state.layerMasks[state.backgroundlayer];
			glyphmask.iclear(bgMask);
			glyphMasks.push([glyphName, glyphmask, glyphbits]);
		}
	}
	return glyphMasks;
}

function printLevel3D() {
	const board = puzzle3DSession && puzzle3DSession.runtime && puzzle3DSession.runtime.board;
	if (!board)
		return;
	const glyphMasks = buildPrintableGlyphMasks();
	var output="Printing 3D level contents:<br><br><span><br>";
	cache_console_messages = false;
	for (var y=0;y<board.height;y++) {
		for (var z=0;z<board.depth;z++) {
			for (var x=0;x<board.width;x++) {
				var cellMask = new BitVec(STRIDE_OBJ);
				board.getCellInto(board.coordToIndex(x, y, z), cellMask);
				var glyph = matchGlyph(cellMask,glyphMasks);
				if (glyph in htmlEntityMap) {
					glyph = htmlEntityMap[glyph];
				}
				output = output+glyph;
			}
			output=output+"<br>";
		}
		if (y<board.height-1)
			output=output+";<br>";
	}
	output+="</span><br><br>";
	consolePrint(output,true);
}

function levelEditorSelectedGlyphMask() {
	var glyphname = glyphImagesCorrespondance[glyphSelectedIndex];
	var glyph = state.glyphDict[glyphname];
	var glyphmask = new BitVec(STRIDE_OBJ);
	for (var i=0;i<glyph.length;i++)
	{
		var id = glyph[i];
		if (id>=0) {
			glyphmask.ibitset(id);
		}
	}

	var backgroundMask = state.layerMasks[state.backgroundlayer];
	if (glyphmask.bitsClearInArray(backgroundMask.data)) {
		glyphmask.ibitset(state.backgroundid);
	}
	return glyphmask;
}

function setLevelEditor3DCell(x, z, glyphmask) {
	const board = getLevelEditor3DBoard();
	if (!board)
		return false;
	const y = clampLevelEditor3DSlice();
	const index = board.coordToIndex(x, y, z);
	const current = new BitVec(STRIDE_OBJ);
	board.getCellInto(index, current);
	if (current.equals(glyphmask))
		return false;
	board.setCell(index, glyphmask);
	const levels = getInputOutputLevels();
	const level = levels && levels[curLevelNo];
	if (level && level.is3d && level.objects) {
		const source = glyphmask.data || glyphmask;
		const start = index * STRIDE_OBJ;
		for (var i=0;i<STRIDE_OBJ;i++)
			level.objects[start + i] = source[i];
	}
	return true;
}

function backgroundCellMaskData3D() {
	const cell = new Int32Array(STRIDE_OBJ);
	cell[state.backgroundid >> 5] |= 1 << (state.backgroundid & 31);
	return cell;
}

function writeCellData3D(cells, cellIndex, cellData) {
	const source = cellData.data || cellData;
	const start = cellIndex * STRIDE_OBJ;
	for (var i=0;i<STRIDE_OBJ;i++)
		cells[start + i] = source[i];
}

function resizeLevelEditor3D(widthDelta, depthDelta, offsetX, offsetZ) {
	const board = getLevelEditor3DBoard();
	const levels = getInputOutputLevels();
	const level = levels && levels[curLevelNo];
	if (!board || !level || !level.is3d)
		return false;

	if (widthDelta < 0 && board.width <= 1)
		widthDelta = 0;
	if (depthDelta < 0 && board.depth <= 1)
		depthDelta = 0;
	if (widthDelta === 0 && depthDelta === 0)
		return false;

	const oldWidth = board.width;
	const oldHeight = board.height;
	const oldDepth = board.depth;
	const newWidth = oldWidth + widthDelta;
	const newDepth = oldDepth + depthDelta;
	const newCellCount = newWidth * oldHeight * newDepth;
	const newObjects = new Int32Array(newCellCount * STRIDE_OBJ);
	const bg = backgroundCellMaskData3D();

	for (var cellIndex=0;cellIndex<newCellCount;cellIndex++)
		writeCellData3D(newObjects, cellIndex, bg);

	const temp = new Int32Array(STRIDE_OBJ);
	for (var x=0;x<oldWidth;x++) {
		for (var y=0;y<oldHeight;y++) {
			for (var z=0;z<oldDepth;z++) {
				const nextX = x + offsetX;
				const nextZ = z + offsetZ;
				if (nextX < 0 || nextZ < 0 || nextX >= newWidth || nextZ >= newDepth)
					continue;
				board.getCellInto(board.coordToIndex(x, y, z), temp);
				const nextIndex = nextX * oldHeight * newDepth + y * newDepth + nextZ;
				writeCellData3D(newObjects, nextIndex, temp);
			}
		}
	}

	level.width = newWidth;
	level.depth = newDepth;
	level.n_tiles = newCellCount;
	level.cellCount = newCellCount;
	level.objects = newObjects;
	delete level.movements;

	if (curLevel && curLevel.is3d) {
		curLevel.width = newWidth;
		curLevel.depth = newDepth;
		curLevel.n_tiles = newCellCount;
		curLevel.cellCount = newCellCount;
	}

	rebuildLevelEditor3DRuntime(level);
	canvasResize();
	return true;
}

function insertLevelEditor3DSliceAt(insertY) {
	const board = getLevelEditor3DBoard();
	const levels = getInputOutputLevels();
	const level = levels && levels[curLevelNo];
	if (!board || !level || !level.is3d)
		return false;

	const oldWidth = board.width;
	const oldHeight = board.height;
	const oldDepth = board.depth;
	insertY = Math.max(0, Math.min(insertY, oldHeight));
	const newHeight = oldHeight + 1;
	const newCellCount = oldWidth * newHeight * oldDepth;
	const newObjects = new Int32Array(newCellCount * STRIDE_OBJ);
	const bg = backgroundCellMaskData3D();

	for (var cellIndex=0;cellIndex<newCellCount;cellIndex++)
		writeCellData3D(newObjects, cellIndex, bg);

	const temp = new Int32Array(STRIDE_OBJ);
	for (var x=0;x<oldWidth;x++) {
		for (var y=0;y<oldHeight;y++) {
			for (var z=0;z<oldDepth;z++) {
				const nextY = y < insertY ? y : y + 1;
				board.getCellInto(board.coordToIndex(x, y, z), temp);
				const nextIndex = x * newHeight * oldDepth + nextY * oldDepth + z;
				writeCellData3D(newObjects, nextIndex, temp);
			}
		}
	}

	level.height = newHeight;
	level.n_tiles = newCellCount;
	level.cellCount = newCellCount;
	level.objects = newObjects;
	delete level.movements;

	if (curLevel && curLevel.is3d) {
		curLevel.height = newHeight;
		curLevel.n_tiles = newCellCount;
		curLevel.cellCount = newCellCount;
	}

	levelEditor3DSlice = insertY;
	rebuildLevelEditor3DRuntime(level);
	canvasResize();
	return true;
}

function rebuildLevelEditor3DRuntime(level) {
	if (typeof GameRuntime3D === "undefined" || !puzzle3DSession || !GameRuntime3D.createRuntimeFromState3D)
		return;
	puzzle3DSession.runtime = GameRuntime3D.createRuntimeFromState3D(state, {
		slotsOptions: {
			level: level
		}
	});
}

function levelEditor3DSliceClick(click) {
	if (!is3DLevelEditorActive() || mouseCoordY !== -2)
		return false;
	if (!click)
		return true;
	if (mouseCoordX === -1)
		insertLevelEditor3DSliceAt(0);
	else if (mouseCoordX === 0)
		setLevelEditor3DSlice(-1);
	else if (mouseCoordX === screenwidth - 3)
		setLevelEditor3DSlice(1);
	else if (mouseCoordX === screenwidth - 2)
		insertLevelEditor3DSliceAt(getLevelEditor3DBoard().height);
	return true;
}

function resizeLevelEditor3DFromBorder(grow) {
	if (!is3DLevelEditorActive())
		return false;
	const extraRows = getLevelEditorExtraTopRows();
	let widthDelta = 0;
	let depthDelta = 0;
	let offsetX = 0;
	let offsetZ = 0;

	if (mouseCoordX === -1) {
		widthDelta = grow ? 1 : -1;
		offsetX = grow ? 1 : -1;
	} else if (mouseCoordX === screenwidth - 2) {
		widthDelta = grow ? 1 : -1;
	}

	if (mouseCoordY === -1) {
		depthDelta = grow ? 1 : -1;
		offsetZ = grow ? 1 : -1;
	} else if (mouseCoordY === screenheight - 2 - editorRowCount - extraRows) {
		depthDelta = grow ? 1 : -1;
	}

	return resizeLevelEditor3D(widthDelta, depthDelta, offsetX, offsetZ);
}

function levelEditor3DClick(event,click) {
	const extraRows = getLevelEditorExtraTopRows();
	if (levelEditor3DSliceClick(click))
		return;

	if (mouseCoordY<=-2-extraRows) {
		var ypos = editorRowCount-(-mouseCoordY-2-extraRows)-1;
		var newindex=mouseCoordX+(screenwidth-1)*ypos;
		if (mouseCoordX===-1) {
			printLevel();
		} else if (mouseCoordX>=0&&newindex<glyphImages.length) {
			glyphSelectedIndex=newindex;
			redraw();
		}

	} else if (mouseCoordX>-1&&mouseCoordY>-1&&mouseCoordX<screenwidth-2&&mouseCoordY<screenheight-2-editorRowCount-extraRows) {
		var glyphmask = levelEditorSelectedGlyphMask();
		const board = getLevelEditor3DBoard();
		const coordIndex = board.coordToIndex(mouseCoordX, clampLevelEditor3DSlice(), mouseCoordY);
		const getcell = new BitVec(STRIDE_OBJ);
		board.getCellInto(coordIndex, getcell);
		if (getcell.equals(glyphmask)) {
			return;
		} else {
			if (anyEditsSinceMouseDown===false) {
				anyEditsSinceMouseDown=true;
			}
			setLevelEditor3DCell(mouseCoordX, mouseCoordY, glyphmask);
			redraw();
		}
	}
	else if (click) {
		if (resizeLevelEditor3DFromBorder(true))
			return;
	}
}

function levelEditor3DRightClick(event,click) {
	const extraRows = getLevelEditorExtraTopRows();
	if (levelEditor3DSliceClick(click))
		return;

	if (mouseCoordY<=-2-extraRows) {
		var ypos = editorRowCount-(-mouseCoordY-2-extraRows)-1;
		var newindex=mouseCoordX+(screenwidth-1)*ypos;
		if (mouseCoordX>=0&&newindex<glyphImages.length) {
			glyphSelectedIndex=newindex;
			redraw();
		}
	} else if (mouseCoordX>-1&&mouseCoordY>-1&&mouseCoordX<screenwidth-2&&mouseCoordY<screenheight-2-editorRowCount-extraRows) {
		var glyphmask = new BitVec(STRIDE_OBJ);
		glyphmask.ibitset(state.backgroundid);
		setLevelEditor3DCell(mouseCoordX, mouseCoordY, glyphmask);
		redraw();
	}
	else if (click) {
		if (resizeLevelEditor3DFromBorder(false))
			return;
	}
}
