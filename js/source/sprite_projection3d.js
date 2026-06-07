(function(root) {
    "use strict";

    function sprite3MatrixTopDownSprite(matrix, colors) {
        const rows = matrix || [];
        let width = 0;
        let sliceCount = 0;
        for (let row = 0; row < rows.length; row++) {
            const cols = rows[row] || [];
            width = Math.max(width, cols.length);
            for (let col = 0; col < cols.length; col++)
                sliceCount = Math.max(sliceCount, (cols[col] || []).length);
        }

        const projectedColors = (colors || []).slice();
        const projectedColorIndexes = {};
        for (let i = 0; i < projectedColors.length; i++)
            projectedColorIndexes[projectedColors[i]] = i;
        const projected = [];
        for (let row = 0; row < rows.length; row++) {
            projected[row] = [];
            for (let col = 0; col < width; col++)
                projected[row][col] = -1;
        }

        for (let row = 0; row < rows.length; row++) {
            for (let col = 0; col < width; col++) {
                const color = sprite3MatrixTopDownColor(rows, row, col, sliceCount, colors || []);
                if (!color)
                    continue;
                if (projectedColorIndexes[color] === undefined) {
                    projectedColorIndexes[color] = projectedColors.length;
                    projectedColors.push(color);
                }
                projected[row][col] = projectedColorIndexes[color];
            }
        }
        return { dat: projected, colors: projectedColors };
    }

    function sprite3MatrixTopDownMatrix(matrix, colors) {
        return sprite3MatrixTopDownSprite(matrix, colors || []).dat;
    }

    function sprite3MatrixTopDownColor(rows, row, col, sliceCount, colors) {
        const output = { r: 0, g: 0, b: 0, a: 0 };
        const slices = rows[row] && rows[row][col] || [];
        for (let slice = 0; slice < sliceCount; slice++) {
            const value = slices[slice];
            if (value < 0 || value === "." || value === " " || value === undefined)
                continue;
            const color = sprite3PaletteColor(value, colors);
            if (!color || color.a <= 0)
                continue;
            const remaining = 1 - output.a;
            output.r += color.r * color.a * remaining;
            output.g += color.g * color.a * remaining;
            output.b += color.b * color.a * remaining;
            output.a += color.a * remaining;
            if (output.a >= 0.999)
                break;
        }
        if (output.a <= 0)
            return null;
        return rgbaToHexColor({
            r: output.r / output.a,
            g: output.g / output.a,
            b: output.b / output.a,
            a: output.a
        });
    }

    function sprite3MatrixTopDownLayeredSprite(entries) {
        let height = 0;
        let width = 0;
        let sliceCount = 0;
        for (const entry of entries || []) {
            const rows = entry && entry.matrix || [];
            height = Math.max(height, rows.length);
            for (let row = 0; row < rows.length; row++) {
                const cols = rows[row] || [];
                width = Math.max(width, cols.length);
                for (let col = 0; col < cols.length; col++)
                    sliceCount = Math.max(sliceCount, (cols[col] || []).length);
            }
        }

        const projectedColors = [];
        const projectedColorIndexes = {};
        const projected = [];
        for (let row = 0; row < height; row++) {
            projected[row] = [];
            for (let col = 0; col < width; col++)
                projected[row][col] = -1;
        }

        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const color = sprite3LayeredTopDownColor(entries || [], row, col, sliceCount);
                if (!color)
                    continue;
                if (projectedColorIndexes[color] === undefined) {
                    projectedColorIndexes[color] = projectedColors.length;
                    projectedColors.push(color);
                }
                projected[row][col] = projectedColorIndexes[color];
            }
        }
        return { dat: projected, colors: projectedColors };
    }

    function sprite3LayeredTopDownColor(entries, row, col, sliceCount) {
        const output = { r: 0, g: 0, b: 0, a: 0 };
        for (let slice = 0; slice < sliceCount; slice++) {
            const sliceColor = sprite3LayeredSliceColor(entries, row, col, slice);
            if (!sliceColor || sliceColor.a <= 0)
                continue;
            const remaining = 1 - output.a;
            output.r += sliceColor.r * sliceColor.a * remaining;
            output.g += sliceColor.g * sliceColor.a * remaining;
            output.b += sliceColor.b * sliceColor.a * remaining;
            output.a += sliceColor.a * remaining;
            if (output.a >= 0.999)
                break;
        }
        if (output.a <= 0)
            return null;
        return rgbaToHexColor({
            r: output.r / output.a,
            g: output.g / output.a,
            b: output.b / output.a,
            a: output.a
        });
    }

    function sprite3LayeredSliceColor(entries, row, col, slice) {
        const output = { r: 0, g: 0, b: 0, a: 0 };
        for (const entry of entries) {
            const rows = entry && entry.matrix || [];
            const slices = rows[row] && rows[row][col] || [];
            const value = slices[slice];
            if (value < 0 || value === "." || value === " " || value === undefined)
                continue;
            const color = sprite3PaletteColor(value, entry.colors || []);
            if (!color || color.a <= 0)
                continue;
            const remaining = 1 - color.a;
            output.r = color.r * color.a + output.r * output.a * remaining;
            output.g = color.g * color.a + output.g * output.a * remaining;
            output.b = color.b * color.a + output.b * output.a * remaining;
            output.a = color.a + output.a * remaining;
            if (output.a > 0) {
                output.r /= output.a;
                output.g /= output.a;
                output.b /= output.a;
            }
        }
        return output.a > 0 ? output : null;
    }

    function sprite3PaletteColor(value, colors) {
        if (typeof value !== "number")
            return parseSpriteColor(value);
        return parseSpriteColor(colors[value]);
    }

    function parseSpriteColor(color) {
        if (!color || String(color).toLowerCase() === "transparent")
            return { r: 0, g: 0, b: 0, a: 0 };
        const hex = String(color).trim();
        const match = hex.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (!match)
            return { r: 255, g: 0, b: 255, a: 1 };
        const value = match[1];
        if (value.length === 3 || value.length === 4) {
            return {
                r: parseInt(value[0] + value[0], 16),
                g: parseInt(value[1] + value[1], 16),
                b: parseInt(value[2] + value[2], 16),
                a: value.length === 4 ? parseInt(value[3] + value[3], 16) / 255 : 1
            };
        }
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16),
            a: value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1
        };
    }

    function rgbaToHexColor(color) {
        const r = clampByte(color.r);
        const g = clampByte(color.g);
        const b = clampByte(color.b);
        const a = Math.max(0, Math.min(1, color.a));
        const rgb = [r, g, b].map(byteToHex).join("");
        if (a >= 0.999)
            return "#" + rgb;
        return "#" + rgb + byteToHex(Math.round(a * 255));
    }

    function clampByte(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    function byteToHex(value) {
        return value.toString(16).padStart(2, "0");
    }

    root.sprite3MatrixTopDownSprite = sprite3MatrixTopDownSprite;
    root.sprite3MatrixTopDownMatrix = sprite3MatrixTopDownMatrix;
    root.sprite3MatrixTopDownLayeredSprite = sprite3MatrixTopDownLayeredSprite;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            sprite3MatrixTopDownSprite,
            sprite3MatrixTopDownMatrix,
            sprite3MatrixTopDownLayeredSprite
        };
    }
})(typeof window !== "undefined" ? window : globalThis);
