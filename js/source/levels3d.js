(function(root) {
    "use strict";

    const DEFAULT_SLICE_SEPARATOR = ";";

    function parseThreeDimensionLevels(lines, options) {
        const opts = normaliseOptions(options);
        const errors = [];
        const levels = [];
        let pendingLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = normaliseLine(lines[i], i + 1);

            if (isBlank(line.text)) {
                flushLevel();
            } else {
                pendingLines.push(line);
            }
        }
        flushLevel();

        return { levels, errors };

        function flushLevel() {
            if (pendingLines.length === 0)
                return;

            const result = parseThreeDimensionLevel(pendingLines, opts);
            levels.push(result.level);
            errors.push(...result.errors);
            pendingLines = [];
        }
    }

    function parseThreeDimensionLevel(lines, options) {
        const opts = normaliseOptions(options);
        const errors = [];
        const sourceLines = lines.map((line, index) => normaliseLine(line, index + 1));
        const slices = [];
        let pendingRows = [];
        let levelLineNumber = null;
        let lastSeparatorLineNumber = null;

        for (const line of sourceLines) {
            const text = line.text.trim();

            if (isBlank(text))
                continue;

            if (levelLineNumber == null)
                levelLineNumber = line.lineNumber;

            if (isSliceSeparator(text, opts)) {
                if (pendingRows.length === 0) {
                    errors.push(makeError("empty_slice", "Slice separator found before any rows in the slice.", line.lineNumber));
                } else {
                    slices.push(makeSlice(pendingRows));
                    pendingRows = [];
                }
                lastSeparatorLineNumber = line.lineNumber;
            } else {
                pendingRows.push({ text, lineNumber: line.lineNumber });
                lastSeparatorLineNumber = null;
            }
        }

        if (pendingRows.length > 0) {
            slices.push(makeSlice(pendingRows));
        } else if (slices.length === 0) {
            errors.push(makeError("empty_level", "3D level has no rows.", levelLineNumber));
        } else if (lastSeparatorLineNumber != null) {
            errors.push(makeError("trailing_slice_separator", "Slice separator cannot end a 3D level.", lastSeparatorLineNumber));
        }

        const dimensions = validateSlices(slices, errors);
        return {
            level: {
                lineNumber: levelLineNumber,
                width: dimensions.width,
                height: slices.length,
                depth: dimensions.rowsPerSlice,
                slices: slices.map(slice => slice.rows.map(row => row.text)),
                rowLineNumbers: slices.map(slice => slice.rows.map(row => row.lineNumber))
            },
            errors
        };
    }

    function coordToIndex3(x, y, z, size) {
        if (typeof x === "object") {
            size = y;
            z = x.z;
            y = x.y;
            x = x.x;
        }
        return x * size.height * size.depth + y * size.depth + z;
    }

    function indexToCoord3(index, size) {
        const yz = size.height * size.depth;
        const x = Math.floor(index / yz);
        const rest = index - x * yz;
        const y = Math.floor(rest / size.depth);
        const z = rest - y * size.depth;
        return { x, y, z };
    }

    function normaliseOptions(options) {
        return {
            sliceSeparator: options && options.sliceSeparator ? options.sliceSeparator : DEFAULT_SLICE_SEPARATOR
        };
    }

    function normaliseLine(line, fallbackLineNumber) {
        if (typeof line === "string") {
            return { text: line, lineNumber: fallbackLineNumber };
        }

        if (Array.isArray(line)) {
            if (typeof line[2] === "string")
                return { text: line[2], lineNumber: line[0] || fallbackLineNumber };
            if (typeof line[1] === "string")
                return { text: line[1], lineNumber: line[0] || fallbackLineNumber };
            if (typeof line[0] === "string")
                return { text: line[0], lineNumber: fallbackLineNumber };
        }

        if (line && typeof line === "object") {
            const text = firstString(line.text, line.raw, line.source, "");
            const lineNumber = firstNumber(line.lineNumber, line.line, fallbackLineNumber);
            return { text, lineNumber };
        }

        return { text: String(line || ""), lineNumber: fallbackLineNumber };
    }

    function firstString() {
        for (let i = 0; i < arguments.length; i++) {
            if (typeof arguments[i] === "string")
                return arguments[i];
        }
        return "";
    }

    function firstNumber() {
        for (let i = 0; i < arguments.length; i++) {
            if (typeof arguments[i] === "number")
                return arguments[i];
        }
        return null;
    }

    function isBlank(text) {
        return text.trim().length === 0;
    }

    function isSliceSeparator(text, options) {
        return text === options.sliceSeparator;
    }

    function makeSlice(rows) {
        return {
            lineNumber: rows[0].lineNumber,
            rows: rows.slice()
        };
    }

    function validateSlices(slices, errors) {
        let width = null;
        let rowsPerSlice = null;

        for (const slice of slices) {
            if (rowsPerSlice == null)
                rowsPerSlice = slice.rows.length;
            else if (slice.rows.length !== rowsPerSlice)
                errors.push(makeError("slice_height_mismatch", "All slices in a 3D level must have the same number of rows.", slice.lineNumber));

            for (const row of slice.rows) {
                if (width == null)
                    width = row.text.length;
                else if (row.text.length !== width)
                    errors.push(makeError("row_width_mismatch", "All rows in a 3D level must have the same width.", row.lineNumber));
            }
        }

        return {
            width: width || 0,
            rowsPerSlice: rowsPerSlice || 0
        };
    }

    function makeError(code, message, lineNumber) {
        return { code, message, lineNumber: lineNumber || null };
    }

    const ThreeDimensionLevels = {
        SLICE_SEPARATOR: DEFAULT_SLICE_SEPARATOR,
        parseThreeDimensionLevels,
        parseThreeDimensionLevel,
        coordToIndex3,
        indexToCoord3
    };

    root.ThreeDimensionLevels = ThreeDimensionLevels;
    if (typeof module !== "undefined" && module.exports)
        module.exports = ThreeDimensionLevels;
})(typeof window !== "undefined" ? window : this);
