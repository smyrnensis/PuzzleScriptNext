(function(root) {
    "use strict";

    const contract = root.Puzzle3DRenderFrameContract
        || (typeof require === "function" ? require("./render_frame_contract3d.js") : null);
    const tweenSemantics = root.PuzzleScriptTweenSemantics
        || (typeof require === "function" ? require("./tween_semantics.js") : null);
    const CAMERA_FIT_PADDING = 1.15;

    class Puzzle3DThreeRenderer {
        constructor(canvas, options) {
            this.canvas = canvas;
            this.options = options || {};
            this.renderer = null;
            this.scene = null;
            this.camera = null;
        }

        render(frame) {
            frame = validateRenderFrame3D(frame);
            if (!root.THREE)
                throw new Error("3D renderer requires Three.js.");

            const THREE = root.THREE;
            const canvas = this.canvas || createCanvas();
            this.canvas = canvas;
            this.ensureRenderer(THREE, canvas);
            disposeObject3D(this.scene);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(frame.view.backgroundColor);
            const shade = shadingEnabled(frame);
            if (shade)
                addLights(THREE, scene, frame);

            const camera = buildCamera(THREE, frame, canvas);
            if (shade)
                addCameraLight(THREE, scene, camera, frame);
            const instances = buildInstances(frame, Object.assign({}, this.options, {
                voxelMesh: true,
                cameraPosition: vectorFromThree(camera.position)
            }));
            for (const group of instances) {
                const material = makeMaterial(THREE, group, shade);
                const mesh = group.kind === "faces"
                    ? meshFromFaceGroup(THREE, group, material)
                    : meshFromBoxGroup(THREE, group, material);
                scene.add(mesh);
            }

            setRendererPixelRatio(this.renderer, this.options);
            this.renderer.setSize(canvas.clientWidth || canvas.width || 640, canvas.clientHeight || canvas.height || 480, false);
            if (typeof this.renderer.clearDepth === "function")
                this.renderer.clearDepth();
            this.renderer.render(scene, camera);

            this.scene = scene;
            this.camera = camera;
            return { rendered: true, instances: instances.reduce((sum, group) => sum + groupInstanceCount(group), 0) };
        }

        dispose() {
            disposeObject3D(this.scene);
            this.scene = null;
            this.camera = null;
            if (this.renderer && typeof this.renderer.dispose === "function")
                this.renderer.dispose();
            this.renderer = null;
        }

        ensureRenderer(THREE, canvas) {
            if (this.renderer)
                return;
            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: this.options.antialias !== false,
                alpha: false,
                depth: true
            });
        }

    }

    function disposeObject3D(object) {
        if (!object)
            return;
        const disposeNode = node => {
            if (!node)
                return;
            if (node.geometry && typeof node.geometry.dispose === "function")
                node.geometry.dispose();
            disposeMaterial(node.material);
        };
        if (typeof object.traverse === "function")
            object.traverse(disposeNode);
        else
            disposeNode(object);
    }

    function disposeMaterial(material) {
        if (!material)
            return;
        if (Array.isArray(material)) {
            for (const item of material)
                disposeMaterial(item);
            return;
        }
        if (typeof material.dispose === "function")
            material.dispose();
    }

    function shadingEnabled(frame) {
        return !frame.view || frame.view.shade !== false;
    }

    function makeMaterial(THREE, group, shade) {
        const materialOptions = {
            color: group.color,
            depthTest: true,
            transparent: group.alpha < 1,
            opacity: group.alpha,
            depthWrite: group.alpha >= 1
        };
        if (THREE.FrontSide != null)
            materialOptions.side = THREE.FrontSide;
        if (!shade) {
            return new THREE.MeshBasicMaterial(materialOptions);
        }

        return new THREE.MeshLambertMaterial(Object.assign({}, materialOptions, {
            emissive: group.color,
            emissiveIntensity: 0.28
        }));
    }

    function formatHexColor(color) {
        return "#" + [color.r, color.g, color.b].map(channel => {
            const value = Math.max(0, Math.min(255, Math.round(channel)));
            return value.toString(16).padStart(2, "0");
        }).join("");
    }

    function meshFromBoxGroup(THREE, group, material) {
        const geometry = new THREE.BoxGeometry(group.scale.x, group.scale.y, group.scale.z);
        const mesh = new THREE.InstancedMesh(geometry, material, group.items.length);
        group.items.forEach((item, index) => {
            const matrix = new THREE.Matrix4();
            matrix.makeTranslation(item.x, item.y, item.z);
            mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    function meshFromFaceGroup(THREE, group, material) {
        const positions = [];
        const normals = [];
        for (const face of group.faces || []) {
            for (const vertex of face.vertices) {
                positions.push(vertex.x, vertex.y, vertex.z);
                normals.push(face.normal.x, face.normal.y, face.normal.z);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
        return new THREE.Mesh(geometry, material);
    }

    function groupInstanceCount(group) {
        if (group.kind === "faces")
            return group.faces.length;
        return group.items.length;
    }

    function addLights(THREE, scene, frame) {
        const ambient = new THREE.AmbientLight("#ffffff", 1.0);
        const key = new THREE.DirectionalLight("#ffffff", 0.52);
        const fill = new THREE.DirectionalLight("#dbeafe", 0.32);
        const size = Math.max(frame.size.width, frame.size.height, frame.size.depth, 1);

        key.position.set(size * 0.8, size * 2.2, -size * 1.1);
        fill.position.set(-size * 1.4, size * 1.2, size * 1.0);
        scene.add(ambient);
        scene.add(key);
        scene.add(fill);
    }

    function addCameraLight(THREE, scene, camera, frame) {
        const size = Math.max(frame.size.width, frame.size.height, frame.size.depth, 1);
        const light = new THREE.PointLight("#ffffff", 0.9, size * 8);
        light.position.copy(camera.position);
        scene.add(light);
    }

    function buildInstances(frame, options) {
        frame = validateRenderFrame3D(frame);
        const objects = frame.objects;
        const groups = new Map();
        const objectGroups = frame.drawPlan.objectGroups;
        const cellOrder = frame.drawPlan.cellOrder;
        const tween = buildTweenState(frame, options || {});
        const solidVoxelOccupancy = options && options.voxelMesh
            ? buildSolidVoxelOccupancy(frame, objectGroups, cellOrder, objects, tween)
            : null;

        for (const objectGroup of objectGroups) {
            for (const cellIndex of cellOrder) {
                const cell = frame.cells[cellIndex];
                if (!cell)
                    continue;
                if (!cellIsInVisibleRegion(frame, cell))
                    continue;
                for (let objectId = objectGroup.firstObjectId; objectId < objectGroup.firstObjectId + objectGroup.objectCount; objectId++) {
                    if (!cell.objectIds || !cell.objectIds.includes(objectId))
                        continue;
                    const object = objects[objectId];
                    if (!object)
                        continue;
                    const items = instancesForObject(frame, cell, object, tween, options || {}, solidVoxelOccupancy);
                    for (const item of items) {
                        if (!isVisibleInstance(item))
                            continue;
                        const key = item.faces
                            ? `${item.color}:${item.alpha}:${item.renderOrder}:faces`
                            : `${item.color}:${item.alpha}:${item.renderOrder}:${item.scale.x}:${item.scale.y}:${item.scale.z}`;
                        if (!groups.has(key)) {
                            const group = {
                                kind: item.faces ? "faces" : "boxes",
                                color: item.color,
                                alpha: item.alpha,
                                renderOrder: item.renderOrder,
                                items: []
                            };
                            if (item.faces) {
                                group.faces = [];
                            } else {
                                group.scale = item.scale;
                            }
                            groups.set(key, group);
                        }
                        const group = groups.get(key);
                        if (item.faces)
                            group.faces.push(...item.faces);
                        else
                            group.items.push(item);
                    }
                }
            }
        }

        return Array.from(groups.values()).sort((left, right) => left.renderOrder - right.renderOrder);
    }

    function isVisibleInstance(item) {
        return item
            && item.color !== "transparent"
            && Number.isFinite(item.alpha)
            && item.alpha >= 0
            && (item.faces || item.scale);
    }

    function instancesForObject(frame, cell, object, tween, options, solidVoxelOccupancy) {
        const presentation = objectPresentation(object);
        if (object.visual && object.visual.voxels && presentation === "floor")
            return floorSpriteInstancesForObject(frame, cell, object, tween);
        if (object.visual && object.visual.voxels && options && options.voxelMesh)
            return voxelFaceInstancesForObject(frame, cell, object, tween, solidVoxelOccupancy, options);
        if (object.visual && object.visual.voxels)
            return voxelInstancesForObject(frame, cell, object, tween);
        return [instanceForObject(frame, cell, object, tween)];
    }

    function instanceForObject(frame, cell, object, tween) {
        const presentation = objectPresentation(object);
        const isSurface = presentation === "floor";
        const transform = tweenTransformForObject(cell, object, tween);
        const position = boardCellToScenePosition(frame, cell, transform.offset);
        const y = position.y + (isSurface ? -0.46 : 0);
        return {
            x: position.x,
            y,
            z: position.z,
            color: object.visual && object.visual.color || "#ff00ff",
            alpha: visualAlpha(object.visual, transform.alpha),
            renderOrder: renderOrderForObject(object),
            scale: surfaceScaleForPresentation(presentation)
        };
    }

    function surfaceScaleForPresentation(presentation) {
        if (presentation === "floor")
            return { x: 1, y: 0.08, z: 1 };
        if (presentation === "solid")
            return { x: 1, y: 1, z: 1 };
        throw new Error(`3D renderer does not support visual presentation "${presentation}".`);
    }

    function visualAlpha(visual, transformAlpha, voxelAlpha) {
        const explicitAlpha = voxelAlpha == null ? visual && visual.alpha : voxelAlpha;
        return Number.isFinite(explicitAlpha) ? explicitAlpha * transformAlpha : transformAlpha;
    }

    function objectPresentation(object) {
        const presentation = object && object.visual && object.visual.presentation;
        if (presentation === "floor" || presentation === "solid")
            return presentation;
        throw new Error(`3D renderer requires explicit supported visual presentation for object "${object && object.name || object && object.id}".`);
    }

    function voxelInstancesForObject(frame, cell, object, tween) {
        const voxels = object.visual.voxels;
        const size = voxels.size || {};
        const width = Math.max(1, size.width || size.x || 1);
        const height = Math.max(1, size.height || size.y || 1);
        const depth = Math.max(1, size.depth || size.z || 1);
        const span = object.visual.span || 1;
        const step = span / Math.max(width, height, depth);
        const transform = tweenTransformForObject(cell, object, tween);
        const position = boardCellToScenePosition(frame, cell, transform.offset);
        const baseX = position.x;
        const baseY = position.y - span / 2;
        const baseZ = position.z;
        const items = [];

        const mergedVoxels = mergeVoxelRuns(voxels.cells || [], {
            x: voxel => voxel.x == null ? voxel.col : voxel.x,
            y: voxel => voxel.y == null ? height - 1 - voxel.slice : voxel.y,
            z: voxel => voxel.z == null ? voxel.row : voxel.z,
            width,
            height,
            depth
        });
        for (const voxel of mergedVoxels) {
            items.push({
                x: baseX + (voxel.x + voxel.width / 2 - 0.5 - (width - 1) / 2) * step,
                y: baseY + (voxel.y + voxel.height / 2) * step,
                z: baseZ + (voxel.z + voxel.depth / 2 - 0.5 - (depth - 1) / 2) * step,
                color: voxel.color || object.visual.color || "#ff00ff",
                alpha: visualAlpha(object.visual, transform.alpha, voxel.alpha),
                renderOrder: renderOrderForObject(object),
                scale: { x: step * voxel.width, y: step * voxel.height, z: step * voxel.depth }
            });
        }

        return items;
    }

    function voxelFaceInstancesForObject(frame, cell, object, tween, solidVoxelOccupancy, options) {
        const cells = worldVoxelCellsForObject(frame, cell, object, tween);
        const occupied = solidVoxelOccupancy || new Set(cells.map(voxel => voxel.worldKey));
        const items = [];

        for (const voxel of cells) {
            const faces = exposedVoxelFaces(voxel, occupied, options && options.cameraPosition);
            if (faces.length === 0)
                continue;
            items.push({
                color: voxel.color || object.visual.color || "#ff00ff",
                alpha: visualAlpha(object.visual, voxel.transformAlpha, voxel.alpha),
                renderOrder: renderOrderForObject(object),
                faces
            });
        }

        return items;
    }

    function buildSolidVoxelOccupancy(frame, objectGroups, cellOrder, objects, tween) {
        const occupied = new Set();
        for (const objectGroup of objectGroups) {
            for (const cellIndex of cellOrder) {
                const cell = frame.cells[cellIndex];
                if (!cell || !cellIsInVisibleRegion(frame, cell))
                    continue;
                for (let objectId = objectGroup.firstObjectId; objectId < objectGroup.firstObjectId + objectGroup.objectCount; objectId++) {
                    if (!cell.objectIds || !cell.objectIds.includes(objectId))
                        continue;
                    const object = objects[objectId];
                    if (!object || !object.visual || !object.visual.voxels)
                        continue;
                    if (objectPresentation(object) !== "solid")
                        continue;
                    for (const voxel of worldVoxelCellsForObject(frame, cell, object, tween)) {
                        if (voxel.color === "transparent")
                            continue;
                        if (visualAlpha(object.visual, voxel.transformAlpha, voxel.alpha) <= 0)
                            continue;
                        occupied.add(voxel.worldKey);
                    }
                }
            }
        }
        return occupied;
    }

    function worldVoxelCellsForObject(frame, cell, object, tween) {
        const voxels = object.visual.voxels;
        const size = voxels.size || {};
        const width = Math.max(1, size.width || size.x || 1);
        const height = Math.max(1, size.height || size.y || 1);
        const depth = Math.max(1, size.depth || size.z || 1);
        const span = object.visual.span || 1;
        const step = span / Math.max(width, height, depth);
        const transform = tweenTransformForObject(cell, object, tween);
        const position = boardCellToScenePosition(frame, cell, transform.offset);
        const base = {
            x: position.x - width * step / 2,
            y: position.y - span / 2,
            z: position.z - depth * step / 2
        };
        return normalizedVoxelCells(voxels.cells || [], width, height, base, step, transform.alpha);
    }

    function normalizedVoxelCells(voxels, width, height, base, step, transformAlpha) {
        const cells = [];
        for (const voxel of voxels || []) {
            const x = voxel.x == null ? voxel.col : voxel.x;
            const y = voxel.y == null ? height - 1 - voxel.slice : voxel.y;
            const z = voxel.z == null ? voxel.row : voxel.z;
            if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z))
                continue;
            const center = {
                x: base.x + (x + 0.5) * step,
                y: base.y + (y + 0.5) * step,
                z: base.z + (z + 0.5) * step
            };
            cells.push({
                x,
                y,
                z,
                color: voxel.color,
                alpha: voxel.alpha,
                transformAlpha,
                step,
                center,
                worldKey: worldVoxelKey(center)
            });
        }
        return cells;
    }

    function exposedVoxelFaces(voxel, occupied, cameraPosition) {
        const half = voxel.step / 2;
        const x0 = voxel.center.x - half;
        const x1 = voxel.center.x + half;
        const y0 = voxel.center.y - half;
        const y1 = voxel.center.y + half;
        const z0 = voxel.center.z - half;
        const z1 = voxel.center.z + half;
        const faces = [];
        addExposedFace(faces, occupied, voxel, 1, 0, 0, { x: 1, y: 0, z: 0 }, cameraPosition, [
            { x: x1, y: y0, z: z0 },
            { x: x1, y: y1, z: z0 },
            { x: x1, y: y1, z: z1 },
            { x: x1, y: y0, z: z0 },
            { x: x1, y: y1, z: z1 },
            { x: x1, y: y0, z: z1 }
        ]);
        addExposedFace(faces, occupied, voxel, -1, 0, 0, { x: -1, y: 0, z: 0 }, cameraPosition, [
            { x: x0, y: y0, z: z1 },
            { x: x0, y: y1, z: z1 },
            { x: x0, y: y1, z: z0 },
            { x: x0, y: y0, z: z1 },
            { x: x0, y: y1, z: z0 },
            { x: x0, y: y0, z: z0 }
        ]);
        addExposedFace(faces, occupied, voxel, 0, 1, 0, { x: 0, y: 1, z: 0 }, cameraPosition, [
            { x: x0, y: y1, z: z0 },
            { x: x0, y: y1, z: z1 },
            { x: x1, y: y1, z: z1 },
            { x: x0, y: y1, z: z0 },
            { x: x1, y: y1, z: z1 },
            { x: x1, y: y1, z: z0 }
        ]);
        addExposedFace(faces, occupied, voxel, 0, -1, 0, { x: 0, y: -1, z: 0 }, cameraPosition, [
            { x: x0, y: y0, z: z1 },
            { x: x0, y: y0, z: z0 },
            { x: x1, y: y0, z: z0 },
            { x: x0, y: y0, z: z1 },
            { x: x1, y: y0, z: z0 },
            { x: x1, y: y0, z: z1 }
        ]);
        addExposedFace(faces, occupied, voxel, 0, 0, 1, { x: 0, y: 0, z: 1 }, cameraPosition, [
            { x: x1, y: y0, z: z1 },
            { x: x1, y: y1, z: z1 },
            { x: x0, y: y1, z: z1 },
            { x: x1, y: y0, z: z1 },
            { x: x0, y: y1, z: z1 },
            { x: x0, y: y0, z: z1 }
        ]);
        addExposedFace(faces, occupied, voxel, 0, 0, -1, { x: 0, y: 0, z: -1 }, cameraPosition, [
            { x: x0, y: y0, z: z0 },
            { x: x0, y: y1, z: z0 },
            { x: x1, y: y1, z: z0 },
            { x: x0, y: y0, z: z0 },
            { x: x1, y: y1, z: z0 },
            { x: x1, y: y0, z: z0 }
        ]);
        return faces;
    }

    function addExposedFace(faces, occupied, voxel, dx, dy, dz, normal, cameraPosition, vertices) {
        const neighborCenter = {
            x: voxel.center.x + dx * voxel.step,
            y: voxel.center.y + dy * voxel.step,
            z: voxel.center.z + dz * voxel.step
        };
        if (occupied.has(worldVoxelKey(neighborCenter)))
            return;
        if (cameraPosition && !faceFacesCamera(normal, vertices, cameraPosition))
            return;
        faces.push({ normal, vertices });
    }

    function faceFacesCamera(normal, vertices, cameraPosition) {
        const center = faceCenter(vertices);
        const toCamera = {
            x: cameraPosition.x - center.x,
            y: cameraPosition.y - center.y,
            z: cameraPosition.z - center.z
        };
        return dot3(normal, toCamera) > 1e-9;
    }

    function faceCenter(vertices) {
        const unique = [vertices[0], vertices[1], vertices[2], vertices[5]];
        return {
            x: unique.reduce((sum, vertex) => sum + vertex.x, 0) / unique.length,
            y: unique.reduce((sum, vertex) => sum + vertex.y, 0) / unique.length,
            z: unique.reduce((sum, vertex) => sum + vertex.z, 0) / unique.length
        };
    }

    function vectorFromThree(vector) {
        return {
            x: Number.isFinite(vector && vector.x) ? vector.x : 0,
            y: Number.isFinite(vector && vector.y) ? vector.y : 0,
            z: Number.isFinite(vector && vector.z) ? vector.z : 0
        };
    }

    function worldVoxelKey(center) {
        return quantizedCoord(center.x) + "," + quantizedCoord(center.y) + "," + quantizedCoord(center.z);
    }

    function quantizedCoord(value) {
        return Math.round(value * 1000000);
    }

    function floorSpriteInstancesForObject(frame, cell, object, tween) {
        const voxels = object.visual.voxels;
        const size = voxels.size || {};
        const width = Math.max(1, size.width || size.x || 1);
        const depth = Math.max(1, size.depth || size.z || 1);
        const span = object.visual.span || 1;
        const stepX = span / width;
        const stepZ = span / depth;
        const transform = tweenTransformForObject(cell, object, tween);
        const position = boardCellToScenePosition(frame, cell, transform.offset);
        const items = [];

        for (const voxel of voxels.cells || []) {
            const vx = voxel.x == null ? voxel.col : voxel.x;
            const vz = voxel.z == null ? voxel.row : voxel.z;
            items.push({
                x: position.x - span / 2 + (vx + 0.5) * stepX,
                y: position.y - 0.46,
                z: position.z - span / 2 + (vz + 0.5) * stepZ,
                color: voxel.color || object.visual.color || "#ff00ff",
                alpha: visualAlpha(object.visual, transform.alpha, voxel.alpha),
                renderOrder: renderOrderForObject(object),
                scale: { x: stepX, y: 0.08, z: stepZ }
            });
        }

        return items;
    }

    function mergeVoxelRuns(voxels, options) {
        const opts = options || {};
        const width = Math.max(1, opts.width || 1);
        const height = Math.max(1, opts.height || 1);
        const depth = Math.max(1, opts.depth || 1);
        const cells = new Map();
        for (const voxel of voxels || []) {
            const x = opts.x(voxel);
            const y = opts.y(voxel);
            const z = opts.z(voxel);
            if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z))
                continue;
            const alpha = voxel.alpha == null ? 1 : voxel.alpha;
            cells.set(voxelKey(x, y, z), {
                x,
                y,
                z,
                color: voxel.color,
                alpha
            });
        }

        const used = new Set();
        const merged = [];
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < depth; z++) {
                for (let x = 0; x < width; x++) {
                    const key = voxelKey(x, y, z);
                    const seed = cells.get(key);
                    if (!seed || used.has(key))
                        continue;

                    let runWidth = 1;
                    while (x + runWidth < width && canMergeVoxel(cells, used, x + runWidth, y, z, seed))
                        runWidth++;

                    let runDepth = 1;
                    while (z + runDepth < depth && canMergePlane(cells, used, x, y, z + runDepth, runWidth, seed))
                        runDepth++;

                    let runHeight = 1;
                    while (y + runHeight < height && canMergeVolumeLayer(cells, used, x, y + runHeight, z, runWidth, runDepth, seed))
                        runHeight++;

                    markMergedVoxels(used, x, y, z, runWidth, runHeight, runDepth);
                    merged.push({
                        x,
                        y,
                        z,
                        width: runWidth,
                        height: runHeight,
                        depth: runDepth,
                        color: seed.color,
                        alpha: seed.alpha
                    });
                }
            }
        }
        return merged;
    }

    function canMergePlane(cells, used, x, y, z, width, seed) {
        for (let dx = 0; dx < width; dx++) {
            if (!canMergeVoxel(cells, used, x + dx, y, z, seed))
                return false;
        }
        return true;
    }

    function canMergeVolumeLayer(cells, used, x, y, z, width, depth, seed) {
        for (let dz = 0; dz < depth; dz++) {
            if (!canMergePlane(cells, used, x, y, z + dz, width, seed))
                return false;
        }
        return true;
    }

    function canMergeVoxel(cells, used, x, y, z, seed) {
        const key = voxelKey(x, y, z);
        if (used.has(key))
            return false;
        const voxel = cells.get(key);
        return !!voxel
            && voxel.color === seed.color
            && voxel.alpha === seed.alpha;
    }

    function markMergedVoxels(used, x, y, z, width, height, depth) {
        for (let dy = 0; dy < height; dy++) {
            for (let dz = 0; dz < depth; dz++) {
                for (let dx = 0; dx < width; dx++)
                    used.add(voxelKey(x + dx, y + dy, z + dz));
            }
        }
    }

    function voxelKey(x, y, z) {
        return x + "," + y + "," + z;
    }

    function renderOrderForObject(object) {
        return Number.isInteger(object && object.layer) ? object.layer : 0;
    }

    function boardCellToScenePosition(frame, cell, offset) {
        const delta = offset || { x: 0, y: 0, z: 0 };
        const center = renderCenter(frame);
        return {
            x: (cell.x + delta.x) - center.x,
            y: -(cell.y + delta.y),
            z: (cell.z + delta.z) - center.z
        };
    }

    function cellIsInVisibleRegion(frame, cell) {
        const region = frame && frame.view && frame.view.visibleRegion;
        if (!region)
            return true;
        return cell.x >= region.x
            && cell.x < region.x + region.width
            && cell.z >= region.z
            && cell.z < region.z + region.depth;
    }

    function renderCenter(frame) {
        const region = frame && frame.view && frame.view.visibleRegion;
        if (region) {
            return {
                x: region.x + (region.width - 1) / 2,
                z: region.z + (region.depth - 1) / 2
            };
        }
        return {
            x: (frame.size.width - 1) / 2,
            z: (frame.size.depth - 1) / 2
        };
    }

    function buildTweenState(frame, options) {
        const tween = frame.effects && frame.effects.tween || {};
        if (!tween.enabled || !tween.lengthMs)
            return null;
        const elapsedMs = Number.isFinite(options.tweenElapsedMs)
            ? options.tweenElapsedMs
            : Number.isFinite(root.tweentimer)
                ? root.tweentimer
                : tween.elapsedMs || 0;
        const snap = positiveInteger(tween.snap, 1);
        const amount = tweenSemantics.calculateMovementTweenAmount({
            elapsedMs,
            lengthMs: tween.lengthMs,
            easing: tween.easing || "linear",
            snap
        });
        if (amount <= 0)
            return null;
        return {
            amount,
            movedEntities: tween.movedEntities || {},
            actionMask: tween.actionMask || 0,
            directionDeltas: tween.directionDeltas || {}
        };
    }

    function tweenTransformForObject(cell, object, tween) {
        if (!tween)
            return identityTweenTransform();
        const movement = tween.movedEntities["p" + cell.index + "-l" + object.layer];
        return tweenSemantics.movementTweenTransform(movement, tween);
    }

    function identityTweenTransform() {
        return {
            offset: { x: 0, y: 0, z: 0 },
            alpha: 1
        };
    }

    function buildCamera(THREE, frame, canvas) {
        const width = canvas.clientWidth || canvas.width || 640;
        const height = canvas.clientHeight || canvas.height || 480;
        const aspect = width / Math.max(1, height);
        const view = frame.view || {};
        const zoom = positiveNumber(view.cameraZoom, 1);
        const fit = cameraFitForFrame(frame, view, aspect, zoom);
        const size = fit.halfSpan;
        const projection = view.projection || "perspective";
        const viewAngle = positiveNumber(view.cameraViewAngle, 35);
        const camera = projection === "perspective"
            ? new THREE.PerspectiveCamera(viewAngle, aspect, 0.1, 1000)
            : new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 0.1, 1000);

        const dir = cameraDirection(view);
        const target = cameraTarget(frame);
        const distance = projection === "perspective"
            ? perspectiveCameraDistance(size, viewAngle, fit.depthHalf)
            : Math.max(1, fit.depthHalf * 3 + 1);
        camera.position.set(
            target.x + dir.x * distance,
            target.y + dir.y * distance,
            target.z + dir.z * distance
        );
        setCameraWorldUp(camera, view);
        camera.lookAt(target.x, target.y, target.z);
        return camera;
    }

    function perspectiveCameraDistance(fitHalfSpan, viewAngle, depthHalf) {
        const fovRadians = positiveNumber(viewAngle, 35) * Math.PI / 180;
        return positiveNumber(fitHalfSpan, 0.5) / Math.tan(fovRadians / 2)
            + Math.max(0, depthHalf || 0);
    }

    function cameraFitForFrame(frame, view, aspect, zoom) {
        const spans = projectedSceneHalfSpans(frame, view);
        const halfSpan = Math.max(
            spans.vertical,
            spans.horizontal / positiveNumber(aspect, 1),
            0.5
        ) * CAMERA_FIT_PADDING / positiveNumber(zoom, 1);
        return {
            halfSpan,
            depthHalf: spans.depth
        };
    }

    function projectedSceneHalfSpans(frame, view) {
        const bounds = visibleSceneBounds(frame);
        const basis = cameraBasisFromView(view);
        const target = cameraTarget(frame);
        const corners = sceneBoundsCorners(bounds);
        let horizontal = 0;
        let vertical = 0;
        let depth = 0;

        for (const corner of corners) {
            const delta = subtract3(corner, target);
            horizontal = Math.max(horizontal, Math.abs(dot3(delta, basis.right)));
            vertical = Math.max(vertical, Math.abs(dot3(delta, basis.up)));
            depth = Math.max(depth, Math.abs(dot3(delta, basis.direction)));
        }

        return { horizontal, vertical, depth };
    }

    function visibleSceneBounds(frame) {
        const size = frame && frame.size || {};
        const region = frame && frame.view && frame.view.visibleRegion;
        const width = positiveNumber(region && region.width, positiveNumber(size.width, 1));
        const depth = positiveNumber(region && region.depth, positiveNumber(size.depth, 1));
        const height = positiveNumber(size.height, 1);
        return {
            min: { x: -width / 2, y: -height + 0.5, z: -depth / 2 },
            max: { x: width / 2, y: 0.5, z: depth / 2 }
        };
    }

    function sceneBoundsCorners(bounds) {
        return [
            { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
            { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z },
            { x: bounds.min.x, y: bounds.max.y, z: bounds.max.z },
            { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z },
            { x: bounds.max.x, y: bounds.min.y, z: bounds.max.z },
            { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
            { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
        ];
    }

    function cameraTarget(frame) {
        const height = frame && frame.size ? frame.size.height : 1;
        return {
            x: 0,
            y: -Math.max(0, positiveNumber(height, 1) - 1) / 2,
            z: 0
        };
    }

    function cameraBasisFromView(view) {
        const direction = normalize3(cameraDirection(view));
        const upHint = cameraUpVectorForView(view, direction);
        let right = normalize3(cross3(upHint, direction));
        if (vectorLength(right) === 0)
            right = { x: 1, y: 0, z: 0 };
        const up = normalize3(cross3(direction, right));
        return { direction, right, up };
    }

    function cameraDirection(view) {
        return cameraVectorFromYawPitch(view && view.yaw, view && view.pitch);
    }

    function cameraVectorFromYawPitch(yawDegrees, pitchDegrees) {
        const yaw = (Number.isFinite(yawDegrees) ? yawDegrees : 0) * Math.PI / 180;
        const pitch = (Number.isFinite(pitchDegrees) ? pitchDegrees : 90) * Math.PI / 180;
        const horizontal = Math.cos(pitch);
        return {
            x: -Math.sin(yaw) * horizontal,
            y: Math.sin(pitch),
            z: Math.cos(yaw) * horizontal
        };
    }

    function setCameraWorldUp(camera, view) {
        if (!camera || !camera.up || typeof camera.up.set !== "function")
            return;
        const direction = cameraDirection(view);
        const up = cameraUpVectorForView(view, direction);
        camera.up.set(up.x, up.y, up.z);
    }

    function cameraUpVectorForView(view, direction) {
        const nearVertical = Math.abs(direction.y) > 0.999;
        if (!nearVertical)
            return { x: 0, y: 1, z: 0 };
        const yaw = (Number.isFinite(view && view.yaw) ? view.yaw : 0) * Math.PI / 180;
        return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    }

    function subtract3(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }

    function dot3(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    function cross3(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    function normalize3(vector) {
        const length = vectorLength(vector);
        if (length === 0)
            return { x: 0, y: 0, z: 0 };
        return {
            x: vector.x / length,
            y: vector.y / length,
            z: vector.z / length
        };
    }

    function vectorLength(vector) {
        return Math.hypot(vector.x, vector.y, vector.z);
    }

    function positiveNumber(value, fallback) {
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    function positiveInteger(value, fallback) {
        return Number.isInteger(value) && value > 0 ? value : fallback;
    }

    function setRendererPixelRatio(renderer, options) {
        if (!renderer || typeof renderer.setPixelRatio !== "function")
            return;
        renderer.setPixelRatio(rendererPixelRatio(options));
    }

    function rendererPixelRatio(options) {
        const opts = options || {};
        const requested = positiveNumber(opts.pixelRatio, root.devicePixelRatio || 1);
        const max = positiveNumber(opts.maxPixelRatio, 2);
        return Math.max(1, Math.min(requested, max));
    }

    function createCanvas() {
        if (!root.document)
            throw new Error("3D renderer needs a canvas in browser contexts.");
        const canvas = root.document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        root.document.body.appendChild(canvas);
        return canvas;
    }

    function renderToCanvas(canvas, frame, options) {
        let renderer = root.puzzle3DThreeRenderer || null;
        if (!renderer || renderer.canvas !== canvas) {
            if (renderer && typeof renderer.dispose === "function")
                renderer.dispose();
            renderer = new Puzzle3DThreeRenderer(canvas, options);
        } else {
            renderer.options = options || {};
        }
        const result = renderer.render(frame);
        root.puzzle3DThreeRenderer = renderer;
        return result;
    }

    function validateRenderFrame3D(frame) {
        if (!frame)
            throw new Error("3D renderer requires a render frame.");
        if (contract && typeof contract.validateRenderFrame3D === "function")
            return contract.validateRenderFrame3D(frame);
        return frame;
    }

    const api = {
        Puzzle3DThreeRenderer,
        renderToCanvas,
        buildInstances,
        buildCamera,
        perspectiveCameraDistance,
        cameraFitForFrame,
        rendererPixelRatio,
        setRendererPixelRatio,
        buildTweenState,
        boardCellToScenePosition,
        cameraVectorFromYawPitch,
        setCameraWorldUp,
        validateRenderFrame3D
    };

    root.Puzzle3DThreeRenderer = api;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : this);
