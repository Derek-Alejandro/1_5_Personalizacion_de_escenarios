import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';

await RAPIER.init();


// ======================================================
// CONFIGURACIÓN GENERAL
// ======================================================

const CHARACTER_TARGET_HEIGHT = 1.45;

// Collider más cercano al cuerpo del personaje.
const CHARACTER_RADIUS = 0.28;
const CHARACTER_HALF_HEIGHT = 0.44;

const CHARACTER_FOOT_OFFSET =
    CHARACTER_HALF_HEIGHT +
    CHARACTER_RADIUS;


// ======================================================
// MOVIMIENTO
// ======================================================

const WALK_SPEED = 2.35;
const RUN_SPEED = 4.75;

const GRAVITY_STEP = 8.0;


// ======================================================
// ANIMACIÓN
// ======================================================

// Qué tan rápido entra/sale el movimiento.
const MOVEMENT_BLEND_SPEED = 8.0;

// Qué tan suave cambia Walk <-> Run.
const RUN_BLEND_SPEED = 6.0;

// Entrada/salida de Throw.
const THROW_BLEND_SPEED = 12.0;

// Ciclos aproximados de pasos por segundo.
const WALK_CYCLE_SPEED = 1.45;
const RUN_CYCLE_SPEED = 2.15;


// ======================================================
// ESCENARIO / CALLE
// ======================================================

const STREET_SAMPLE_GRID = 23;

const STREET_HEIGHT_TOLERANCE = 0.55;

const STREET_CLEARANCE_HEIGHT = 0.95;
const STREET_CLEARANCE_MAX = 12;


// ======================================================
// PIRÁMIDE
// ======================================================

const PYRAMID_DISTANCE = 4.8;


// ======================================================
// LIMITES INVISIBLES
// ======================================================

const WORLD_WALL_HEIGHT = 16;
const WORLD_WALL_THICKNESS = 1.0;
const WORLD_MARGIN = 1.5;

const SAFETY_FLOOR_THICKNESS = 1;


// ======================================================
// PROYECTIL
// ======================================================

const PROJECTILE_RADIUS = 0.14;
const PROJECTILE_SPEED = 13;


// ======================================================
// ESCENA
// ======================================================

const container =
    document.getElementById('scene-container');

const scene =
    new THREE.Scene();

scene.background =
    new THREE.Color(0x07111f);


// ======================================================
// CÁMARA
// ======================================================

const camera =
    new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1500
    );


// ======================================================
// RENDERER
// ======================================================

const renderer =
    new THREE.WebGLRenderer({
        antialias: true
    });

renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.shadowMap.enabled = true;

renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;

container.appendChild(
    renderer.domElement
);


// ======================================================
// ILUMINACIÓN
// ======================================================

const hemisphereLight =
    new THREE.HemisphereLight(
        0xcfe8ff,
        0x202020,
        1.7
    );

scene.add(
    hemisphereLight
);


const sun =
    new THREE.DirectionalLight(
        0xffffff,
        3
    );

sun.position.set(
    -10,
    25,
    10
);

sun.castShadow = true;

sun.shadow.mapSize.set(
    2048,
    2048
);

sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 120;

sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;

scene.add(
    sun
);


// ======================================================
// ORBIT CONTROLS
// ======================================================

const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );

controls.enableDamping = true;

controls.enablePan = false;

controls.minDistance = 3;

controls.maxDistance = 14;

controls.maxPolarAngle =
    Math.PI * 0.48;


// ======================================================
// FÍSICAS
// ======================================================

const physicsWorld =
    new RAPIER.World({
        x: 0,
        y: -9.81,
        z: 0
    });


// ======================================================
// LOADERS
// ======================================================

const gltfLoader =
    new GLTFLoader();

const fbxLoader =
    new FBXLoader();


// ======================================================
// TIMER
// ======================================================

const timer =
    new THREE.Timer();


// ======================================================
// CIUDAD
// ======================================================

let city = null;

let cityMeshes = [];

let cityBounds = null;


// ======================================================
// SPAWN
// ======================================================

let streetSpawn =
    new THREE.Vector3(
        0,
        0,
        0
    );

let streetForward =
    new THREE.Vector3(
        0,
        0,
        -1
    );

let pyramidSpawn =
    new THREE.Vector3(
        0,
        0,
        -PYRAMID_DISTANCE
    );


// ======================================================
// PERSONAJE
// ======================================================

let character = null;

let characterVisualMinY = 0;


// ======================================================
// FÍSICA DEL PERSONAJE
// ======================================================

let characterBody = null;

let characterCollider = null;

let characterController = null;


// ======================================================
// ANIMACIONES
// ======================================================

let mixer = null;

const actions = {};

let characterReady = false;


// Estado suave de locomoción.

let movementBlend = 0;

let runBlend = 0;

let gaitPhase = 0;


// Throw.

let isThrowing = false;

let canThrow = true;

let throwBlend = 0;

let throwReleased = false;

let throwVisualEndTime = 0;


// ======================================================
// OBJETOS DINÁMICOS
// ======================================================

const dynamicObjects = [];


// ======================================================
// TECLADO
// ======================================================

const keyStates = {};


// ======================================================
// VECTORES TEMPORALES
// ======================================================

const desired =
    new THREE.Vector3();

const forward =
    new THREE.Vector3();

const side =
    new THREE.Vector3();

const move =
    new THREE.Vector3();

const lastCharacterPosition =
    new THREE.Vector3();

const currentCharacterPosition =
    new THREE.Vector3();

const characterMoveDelta =
    new THREE.Vector3();


// ======================================================
// TECLADO
// ======================================================

document.addEventListener(
    'keydown',
    (event) => {

        keyStates[event.code] = true;

        if (
            event.code === 'KeyF' &&
            !event.repeat &&
            canThrow
        ) {

            throwObject();

        }

    }
);


document.addEventListener(
    'keyup',
    (event) => {

        keyStates[event.code] = false;

    }
);


// ======================================================
// COLLIDER DE LA CIUDAD
// ======================================================

function createStaticTrimesh(mesh) {

    const geometry =
        mesh.geometry;

    const position =
        geometry
            ?.attributes
            ?.position;

    if (!position) {
        return;
    }


    mesh.updateWorldMatrix(
        true,
        false
    );


    const vertices =
        new Float32Array(
            position.count * 3
        );


    const point =
        new THREE.Vector3();


    for (
        let i = 0;
        i < position.count;
        i++
    ) {

        point
            .fromBufferAttribute(
                position,
                i
            )
            .applyMatrix4(
                mesh.matrixWorld
            );


        vertices[i * 3] =
            point.x;

        vertices[i * 3 + 1] =
            point.y;

        vertices[i * 3 + 2] =
            point.z;

    }


    let indices;


    if (geometry.index) {

        indices =
            new Uint32Array(
                geometry.index.array
            );

    }

    else {

        indices =
            new Uint32Array(
                position.count
            );

        for (
            let i = 0;
            i < position.count;
            i++
        ) {

            indices[i] = i;

        }

    }


    physicsWorld.createCollider(

        RAPIER
            .ColliderDesc
            .trimesh(
                vertices,
                indices
            )
            .setFriction(0.9)
            .setRestitution(0)

    );

}


// ======================================================
// MESHES DE LA CIUDAD
// ======================================================

function collectCityMeshes(root) {

    const meshes = [];


    root.traverse(
        (child) => {

            if (
                child.isMesh &&
                child.geometry
            ) {

                meshes.push(
                    child
                );

            }

        }
    );


    return meshes;

}


// ======================================================
// RAYCAST SUPERFICIE HORIZONTAL
// ======================================================

function getHorizontalHit(raycaster) {

    const hits =
        raycaster.intersectObjects(
            cityMeshes,
            false
        );


    for (
        const hit
        of hits
    ) {

        if (!hit.face) {
            continue;
        }


        const normalMatrix =
            new THREE.Matrix3()
                .getNormalMatrix(
                    hit.object.matrixWorld
                );


        const worldNormal =
            hit.face.normal
                .clone()
                .applyMatrix3(
                    normalMatrix
                )
                .normalize();


        if (
            worldNormal.y > 0.72
        ) {

            return hit;

        }

    }


    return null;

}


// ======================================================
// OBTENER SUELO
// ======================================================

function groundPointAt(
    x,
    z,
    referenceY = null
) {

    if (
        !city ||
        !cityBounds
    ) {

        return null;

    }


    const size =
        cityBounds.getSize(
            new THREE.Vector3()
        );


    const rayHeight =
        cityBounds.max.y +
        Math.max(
            30,
            size.y * 0.5
        );


    const raycaster =
        new THREE.Raycaster(
            new THREE.Vector3(
                x,
                rayHeight,
                z
            ),
            new THREE.Vector3(
                0,
                -1,
                0
            )
        );


    const hit =
        getHorizontalHit(
            raycaster
        );


    if (!hit) {
        return null;
    }


    if (
        referenceY !== null &&
        Math.abs(
            hit.point.y -
            referenceY
        ) >
        STREET_HEIGHT_TOLERANCE + 0.25
    ) {

        return null;

    }


    return hit.point.clone();

}


// ======================================================
// ESPACIO LIBRE HORIZONTAL
// ======================================================

function horizontalClearance(
    point,
    direction,
    maxDistance = STREET_CLEARANCE_MAX
) {

    const origin =
        point.clone();

    origin.y +=
        STREET_CLEARANCE_HEIGHT;


    const dir =
        direction
            .clone()
            .normalize();


    const raycaster =
        new THREE.Raycaster(
            origin,
            dir,
            0.05,
            maxDistance
        );


    const hits =
        raycaster.intersectObjects(
            cityMeshes,
            false
        );


    if (!hits.length) {

        return maxDistance;

    }


    return Math.min(
        hits[0].distance,
        maxDistance
    );

}


// ======================================================
// MEDIR QUÉ TAN ABIERTA ESTÁ UNA ZONA
// ======================================================

function streetOpennessScore(point) {

    let total = 0;

    let minimum = Infinity;

    let maximum = 0;


    for (
        let i = 0;
        i < 8;
        i++
    ) {

        const angle =
            (
                Math.PI *
                2 *
                i
            )
            /
            8;


        const direction =
            new THREE.Vector3(
                Math.cos(angle),
                0,
                Math.sin(angle)
            );


        const distance =
            horizontalClearance(
                point,
                direction
            );


        total += distance;

        minimum =
            Math.min(
                minimum,
                distance
            );

        maximum =
            Math.max(
                maximum,
                distance
            );

    }


    const average =
        total / 8;


    return (
        average +
        minimum * 0.9 +
        maximum * 0.35
    );

}


// ======================================================
// DIRECCIÓN DE LA CALLE
// ======================================================

function detectStreetDirection(point) {

    let bestDirection =
        new THREE.Vector3(
            0,
            0,
            -1
        );


    let bestScore =
        -Infinity;


    const steps = 24;


    for (
        let i = 0;
        i < steps;
        i++
    ) {

        const angle =
            (
                Math.PI *
                i
            )
            /
            steps;


        const direction =
            new THREE.Vector3(
                Math.cos(angle),
                0,
                Math.sin(angle)
            );


        const front =
            horizontalClearance(
                point,
                direction
            );


        const back =
            horizontalClearance(
                point,
                direction
                    .clone()
                    .negate()
            );


        const score =
            front + back;


        if (
            score > bestScore
        ) {

            bestScore = score;


            if (
                front >= back
            ) {

                bestDirection.copy(
                    direction
                );

            }

            else {

                bestDirection.copy(
                    direction
                        .clone()
                        .negate()
                );

            }

        }

    }


    return bestDirection.normalize();

}


// ======================================================
// BUSCAR SPAWN EN CALLE
// ======================================================

function findBestStreetSpawn() {

    city.updateWorldMatrix(
        true,
        true
    );


    cityBounds =
        new THREE.Box3()
            .setFromObject(
                city
            );


    const size =
        cityBounds.getSize(
            new THREE.Vector3()
        );


    const center =
        cityBounds.getCenter(
            new THREE.Vector3()
        );


    const marginX =
        size.x * 0.15;

    const marginZ =
        size.z * 0.15;


    const minX =
        cityBounds.min.x +
        marginX;

    const maxX =
        cityBounds.max.x -
        marginX;

    const minZ =
        cityBounds.min.z +
        marginZ;

    const maxZ =
        cityBounds.max.z -
        marginZ;


    const samples = [];


    for (
        let ix = 0;
        ix < STREET_SAMPLE_GRID;
        ix++
    ) {

        const tx =
            ix /
            (
                STREET_SAMPLE_GRID -
                1
            );


        const x =
            THREE.MathUtils.lerp(
                minX,
                maxX,
                tx
            );


        for (
            let iz = 0;
            iz < STREET_SAMPLE_GRID;
            iz++
        ) {

            const tz =
                iz /
                (
                    STREET_SAMPLE_GRID -
                    1
                );


            const z =
                THREE.MathUtils.lerp(
                    minZ,
                    maxZ,
                    tz
                );


            const point =
                groundPointAt(
                    x,
                    z
                );


            if (!point) {
                continue;
            }


            samples.push({

                point,

                centerDistance:
                    Math.hypot(
                        point.x -
                        center.x,

                        point.z -
                        center.z
                    )

            });

        }

    }


    if (
        !samples.length
    ) {

        return {

            position:
                new THREE.Vector3(
                    0,
                    0,
                    0
                ),

            forward:
                new THREE.Vector3(
                    0,
                    0,
                    -1
                )

        };

    }


    const heights =
        samples
            .map(
                sample =>
                    sample.point.y
            )
            .sort(
                (a, b) =>
                    a - b
            );


    const referenceIndex =
        Math.min(
            heights.length - 1,

            Math.floor(
                heights.length * 0.30
            )
        );


    const roadReferenceY =
        heights[
            referenceIndex
        ];


    let candidates =
        samples.filter(
            sample =>
                sample.point.y <=
                roadReferenceY +
                STREET_HEIGHT_TOLERANCE
        );


    if (
        !candidates.length
    ) {

        candidates =
            samples;

    }


    candidates.sort(
        (a, b) =>
            a.centerDistance -
            b.centerDistance
    );


    candidates =
        candidates.slice(
            0,
            Math.min(
                candidates.length,
                100
            )
        );


    let best =
        candidates[0];


    let bestScore =
        -Infinity;


    for (
        const candidate
        of candidates
    ) {

        const openness =
            streetOpennessScore(
                candidate.point
            );


        const score =
            openness -
            candidate.centerDistance *
            0.035;


        if (
            score > bestScore
        ) {

            bestScore =
                score;

            best =
                candidate;

        }

    }


    return {

        position:
            best.point.clone(),

        forward:
            detectStreetDirection(
                best.point
            )

    };

}


// ======================================================
// SPAWN DE LA PIRÁMIDE
// ======================================================

function findPyramidSpawn(
    characterPoint,
    direction
) {

    const right =
        new THREE.Vector3(
            -direction.z,
            0,
            direction.x
        )
            .normalize();


    const distances = [
        PYRAMID_DISTANCE,
        PYRAMID_DISTANCE - 0.5,
        PYRAMID_DISTANCE + 0.5,
        PYRAMID_DISTANCE - 1
    ];


    const lateralOffsets = [
        0,
        0.4,
        -0.4,
        0.8,
        -0.8
    ];


    let bestPoint = null;

    let bestScore = Infinity;


    for (
        const distance
        of distances
    ) {

        for (
            const lateral
            of lateralOffsets
        ) {

            const testPoint =
                characterPoint
                    .clone()
                    .addScaledVector(
                        direction,
                        distance
                    )
                    .addScaledVector(
                        right,
                        lateral
                    );


            const ground =
                groundPointAt(
                    testPoint.x,
                    testPoint.z,
                    characterPoint.y
                );


            if (!ground) {
                continue;
            }


            const score =
                Math.abs(
                    distance -
                    PYRAMID_DISTANCE
                )
                +
                Math.abs(lateral) *
                0.4
                +
                Math.abs(
                    ground.y -
                    characterPoint.y
                ) *
                5;


            if (
                score <
                bestScore
            ) {

                bestScore =
                    score;

                bestPoint =
                    ground.clone();

            }

        }

    }


    if (
        bestPoint
    ) {

        return bestPoint;

    }


    return characterPoint
        .clone()
        .addScaledVector(
            direction,
            PYRAMID_DISTANCE
        );

}


// ======================================================
// PAREDES INVISIBLES
// ======================================================

function createInvisibleWorldBounds() {

    if (!cityBounds) {
        return;
    }


    const size =
        cityBounds.getSize(
            new THREE.Vector3()
        );


    const center =
        cityBounds.getCenter(
            new THREE.Vector3()
        );


    const width =
        size.x +
        WORLD_MARGIN * 2;


    const depth =
        size.z +
        WORLD_MARGIN * 2;


    const baseY =
        Math.min(
            cityBounds.min.y,
            streetSpawn.y
        )
        -
        1;


    const wallCenterY =
        baseY +
        WORLD_WALL_HEIGHT / 2;


    // ==================================================
    // NORTE
    // ==================================================

    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .cuboid(
                width / 2,
                WORLD_WALL_HEIGHT / 2,
                WORLD_WALL_THICKNESS / 2
            )
            .setTranslation(
                center.x,
                wallCenterY,
                cityBounds.min.z -
                WORLD_MARGIN
            )
            .setFriction(
                0.9
            )

    );


    // ==================================================
    // SUR
    // ==================================================

    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .cuboid(
                width / 2,
                WORLD_WALL_HEIGHT / 2,
                WORLD_WALL_THICKNESS / 2
            )
            .setTranslation(
                center.x,
                wallCenterY,
                cityBounds.max.z +
                WORLD_MARGIN
            )
            .setFriction(
                0.9
            )

    );


    // ==================================================
    // IZQUIERDA
    // ==================================================

    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .cuboid(
                WORLD_WALL_THICKNESS / 2,
                WORLD_WALL_HEIGHT / 2,
                depth / 2
            )
            .setTranslation(
                cityBounds.min.x -
                WORLD_MARGIN,
                wallCenterY,
                center.z
            )
            .setFriction(
                0.9
            )

    );


    // ==================================================
    // DERECHA
    // ==================================================

    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .cuboid(
                WORLD_WALL_THICKNESS / 2,
                WORLD_WALL_HEIGHT / 2,
                depth / 2
            )
            .setTranslation(
                cityBounds.max.x +
                WORLD_MARGIN,
                wallCenterY,
                center.z
            )
            .setFriction(
                0.9
            )

    );


    // ==================================================
    // PISO DE SEGURIDAD
    // ==================================================
    //
    // No es visible.
    //
    // Si una caja o pelota encuentra algún hueco
    // extraño del modelo, no caerá para siempre.
    // ==================================================

    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .cuboid(
                width / 2,
                SAFETY_FLOOR_THICKNESS / 2,
                depth / 2
            )
            .setTranslation(
                center.x,
                baseY -
                SAFETY_FLOOR_THICKNESS / 2,
                center.z
            )
            .setFriction(
                0.9
            )

    );


    console.log(
        'Límites invisibles creados.'
    );

}


// ======================================================
// CARGAR CIUDAD
// ======================================================

function loadCity() {

    return new Promise(
        (
            resolve,
            reject
        ) => {


            gltfLoader.load(

                './assets/models/city/scene.gltf',

                (gltf) => {


                    city =
                        gltf.scene;


                    scene.add(
                        city
                    );


                    city.updateWorldMatrix(
                        true,
                        true
                    );


                    cityMeshes =
                        collectCityMeshes(
                            city
                        );


                    let colliderCount = 0;


                    city.traverse(
                        (child) => {


                            if (
                                !child.isMesh
                            ) {

                                return;

                            }


                            child.castShadow =
                                true;

                            child.receiveShadow =
                                true;


                            createStaticTrimesh(
                                child
                            );


                            colliderCount++;

                        }
                    );


                    cityBounds =
                        new THREE.Box3()
                            .setFromObject(
                                city
                            );


                    const detected =
                        findBestStreetSpawn();


                    streetSpawn.copy(
                        detected.position
                    );


                    streetForward
                        .copy(
                            detected.forward
                        )
                        .normalize();


                    pyramidSpawn.copy(

                        findPyramidSpawn(
                            streetSpawn,
                            streetForward
                        )

                    );


                    // Crear paredes invisibles.

                    createInvisibleWorldBounds();


                    console.log(
                        'Spawn:',
                        streetSpawn
                    );


                    console.log(
                        'Pirámide:',
                        pyramidSpawn
                    );


                    console.log(
                        `Colliders de ciudad: ${colliderCount}`
                    );


                    resolve(
                        city
                    );

                },


                undefined,


                (error) => {

                    console.error(
                        'Error cargando ciudad:',
                        error
                    );

                    reject(
                        error
                    );

                }

            );

        }
    );

}


// ======================================================
// FÍSICA DEL PERSONAJE
// ======================================================

function createCharacterPhysics() {

    const spawnY =
        streetSpawn.y +
        CHARACTER_FOOT_OFFSET +
        0.06;


    characterBody =
        physicsWorld.createRigidBody(

            RAPIER.RigidBodyDesc
                .kinematicPositionBased()
                .setTranslation(
                    streetSpawn.x,
                    spawnY,
                    streetSpawn.z
                )

        );


    characterCollider =
        physicsWorld.createCollider(

            RAPIER.ColliderDesc
                .capsule(
                    CHARACTER_HALF_HEIGHT,
                    CHARACTER_RADIUS
                )
                .setFriction(
                    0.2
                )
                .setRestitution(
                    0
                ),

            characterBody

        );


    characterController =
        physicsWorld
            .createCharacterController(
                0.025
            );


    // Banquetas pequeñas sí.
    // Cajas grandes no.

    characterController.enableAutostep(
        0.22,
        0.12,
        true
    );


    characterController.enableSnapToGround(
        0.30
    );


    characterController
        .setApplyImpulsesToDynamicBodies(
            true
        );


    // Algunas versiones de Rapier incluyen
    // esta opción.

    if (
        typeof characterController.setCharacterMass
        ===
        'function'
    ) {

        characterController.setCharacterMass(
            70
        );

    }


    lastCharacterPosition.set(
        streetSpawn.x,
        spawnY,
        streetSpawn.z
    );


    // Cámara detrás del personaje.

    camera.position
        .copy(
            streetSpawn
        )
        .addScaledVector(
            streetForward,
            -5.6
        );


    camera.position.y =
        spawnY + 2.6;


    controls.target.set(
        streetSpawn.x,
        streetSpawn.y + 0.9,
        streetSpawn.z
    );


    controls.update();

}


// ======================================================
// QUITAR ROOT MOTION REALMENTE
// ======================================================

function removeHorizontalRootMotion(
    clip
) {

    for (
        const track
        of clip.tracks
    ) {

        const trackName =
            track.name.toLowerCase();


        if (
            !trackName.endsWith(
                '.position'
            )
            ||
            !trackName.includes(
                'hips'
            )
            ||
            track.values.length < 3
        ) {

            continue;

        }


        // ==================================================
        // IMPORTANTE
        // ==================================================
        //
        // Antes restábamos el primer valor.
        //
        // Eso seguía permitiendo que Mixamo desplazara
        // la pelvis horizontalmente.
        //
        // Ahora X y Z quedan realmente fijos.
        //
        // Y se conserva para mantener el movimiento
        // vertical natural del cuerpo.
        // ==================================================

        const baseX =
            track.values[0];

        const baseZ =
            track.values[2];


        for (
            let i = 0;
            i < track.values.length;
            i += 3
        ) {

            track.values[i] =
                baseX;

            track.values[i + 2] =
                baseZ;

        }

    }


    clip.optimize();

}


// ======================================================
// DETECTAR FINAL VISUAL REAL
// ======================================================

function calculateVisualEndTime(
    clip
) {

    let lastMotionTime = 0;


    for (
        const track
        of clip.tracks
    ) {

        const times =
            track.times;

        const values =
            track.values;


        if (
            times.length < 2
        ) {

            continue;

        }


        const valueSize =
            track.getValueSize();


        for (
            let key = 1;
            key < times.length;
            key++
        ) {

            let changed =
                false;


            const currentOffset =
                key * valueSize;


            const previousOffset =
                (
                    key - 1
                )
                *
                valueSize;


            for (
                let component = 0;
                component < valueSize;
                component++
            ) {

                const difference =
                    Math.abs(

                        values[
                            currentOffset +
                            component
                        ]

                        -

                        values[
                            previousOffset +
                            component
                        ]

                    );


                if (
                    difference > 0.0001
                ) {

                    changed =
                        true;

                    break;

                }

            }


            if (
                changed
            ) {

                lastMotionTime =
                    Math.max(
                        lastMotionTime,
                        times[key]
                    );

            }

        }

    }


    if (
        lastMotionTime <= 0
    ) {

        return clip.duration;

    }


    return Math.min(
        lastMotionTime,
        clip.duration
    );

}


// ======================================================
// CARGAR ANIMACIÓN
// ======================================================

function loadCharacterAnimation(
    name,
    path
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {


            fbxLoader.load(

                path,

                (animationFBX) => {


                    if (
                        !animationFBX.animations
                        ||
                        animationFBX.animations.length === 0
                    ) {

                        reject(

                            new Error(
                                `${path} no contiene animaciones.`
                            )

                        );

                        return;

                    }


                    const clip =
                        animationFBX
                            .animations[0]
                            .clone();


                    clip.name =
                        name;


                    removeHorizontalRootMotion(
                        clip
                    );


                    const action =
                        mixer.clipAction(
                            clip
                        );


                    if (
                        name === 'throw'
                    ) {

                        action.setLoop(
                            THREE.LoopOnce,
                            1
                        );


                        action.clampWhenFinished =
                            true;


                        throwVisualEndTime =
                            calculateVisualEndTime(
                                clip
                            );


                        console.log(
                            'Throw duration:',
                            clip.duration
                        );


                        console.log(
                            'Final visual Throw:',
                            throwVisualEndTime
                        );

                    }

                    else {

                        action.setLoop(
                            THREE.LoopRepeat,
                            Infinity
                        );


                        action.clampWhenFinished =
                            false;

                    }


                    actions[name] =
                        action;


                    resolve(
                        action
                    );

                },


                undefined,


                (error) => {

                    reject(
                        error
                    );

                }

            );

        }
    );

}


// ======================================================
// NORMALIZAR TAMAÑO
// ======================================================

function normalizeCharacterSize(
    object
) {

    object.scale.set(
        1,
        1,
        1
    );


    object.position.set(
        0,
        0,
        0
    );


    object.updateWorldMatrix(
        true,
        true
    );


    const originalBox =
        new THREE.Box3()
            .setFromObject(
                object
            );


    const originalHeight =
        originalBox.max.y -
        originalBox.min.y;


    if (
        !Number.isFinite(
            originalHeight
        )
        ||
        originalHeight <= 0
    ) {

        object.scale.setScalar(
            0.01
        );

        return;

    }


    const scale =
        CHARACTER_TARGET_HEIGHT /
        originalHeight;


    object.scale.setScalar(
        scale
    );


    object.updateWorldMatrix(
        true,
        true
    );


    const scaledBox =
        new THREE.Box3()
            .setFromObject(
                object
            );


    characterVisualMinY =
        scaledBox.min.y;

}


// ======================================================
// CONFIGURAR LOCOMOCIÓN
// ======================================================

function setupLocomotionActions() {

    // ==================================================
    // IDLE
    // ==================================================

    actions.idle
        .reset()
        .play();


    // ==================================================
    // WALK
    // ==================================================

    actions.walk
        .reset()
        .play();


    // Pausado temporalmente porque controlaremos
    // manualmente su fase.

    actions.walk.paused =
        true;


    // ==================================================
    // RUN
    // ==================================================

    actions.run
        .reset()
        .play();


    actions.run.paused =
        true;


    // ==================================================
    // PESOS INICIALES
    // ==================================================

    actions.idle.setEffectiveWeight(
        1
    );


    actions.walk.setEffectiveWeight(
        0
    );


    actions.run.setEffectiveWeight(
        0
    );


    actions.throw.setEffectiveWeight(
        0
    );


    movementBlend =
        0;


    runBlend =
        0;


    gaitPhase =
        0;


    throwBlend =
        0;

}


// ======================================================
// CARGAR PERSONAJE
// ======================================================

function loadCharacter() {

    return new Promise(
        (
            resolve,
            reject
        ) => {


            fbxLoader.load(

                './assets/models/character/character.fbx',

                async (fbx) => {


                    character =
                        fbx;


                    normalizeCharacterSize(
                        character
                    );


                    character.traverse(
                        (child) => {


                            if (
                                !child.isMesh
                            ) {

                                return;

                            }


                            child.castShadow =
                                true;


                            child.receiveShadow =
                                true;


                            if (
                                Array.isArray(
                                    child.material
                                )
                            ) {

                                child.material.forEach(
                                    material => {

                                        material.needsUpdate =
                                            true;

                                    }
                                );

                            }

                            else if (
                                child.material
                            ) {

                                child.material.needsUpdate =
                                    true;

                            }

                        }
                    );


                    scene.add(
                        character
                    );


                    mixer =
                        new THREE.AnimationMixer(
                            character
                        );


                    try {


                        await Promise.all([

                            loadCharacterAnimation(
                                'idle',
                                './assets/models/props/Idle.fbx'
                            ),

                            loadCharacterAnimation(
                                'walk',
                                './assets/models/props/Walking.fbx'
                            ),

                            loadCharacterAnimation(
                                'run',
                                './assets/models/props/Running.fbx'
                            ),

                            loadCharacterAnimation(
                                'throw',
                                './assets/models/props/Throw.fbx'
                            )

                        ]);


                        setupLocomotionActions();


                        character.rotation.y =
                            Math.atan2(
                                streetForward.x,
                                streetForward.z
                            );


                        characterReady =
                            true;


                        syncCharacter(
                            true
                        );


                        console.log(
                            'Personaje listo.'
                        );


                        resolve(
                            character
                        );

                    }

                    catch (
                        error
                    ) {

                        reject(
                            error
                        );

                    }

                },


                undefined,


                (error) => {

                    reject(
                        error
                    );

                }

            );

        }
    );

}


// ======================================================
// INPUT DE MOVIMIENTO
// ======================================================

function hasMovementInput() {

    return !!(

        keyStates.KeyW ||
        keyStates.KeyA ||
        keyStates.KeyS ||
        keyStates.KeyD

    );

}


// ======================================================
// ANIMACIÓN FLUIDA
// ======================================================

function updateLocomotionAnimation(
    delta
) {

    if (
        !characterReady ||
        !actions.idle ||
        !actions.walk ||
        !actions.run
    ) {

        return;

    }


    const moving =
        hasMovementInput();


    const running =
        moving &&
        (
            keyStates.ShiftLeft ||
            keyStates.ShiftRight
        );


    // ==================================================
    // ENTRADA/SALIDA DE MOVIMIENTO
    // ==================================================

    movementBlend =
        THREE.MathUtils.damp(

            movementBlend,

            moving ? 1 : 0,

            MOVEMENT_BLEND_SPEED,

            delta

        );


    // ==================================================
    // WALK <-> RUN
    // ==================================================

    runBlend =
        THREE.MathUtils.damp(

            runBlend,

            running ? 1 : 0,

            RUN_BLEND_SPEED,

            delta

        );


    // ==================================================
    // CICLO DE PASOS COMPARTIDO
    // ==================================================
    //
    // Walking y Running usan exactamente la misma fase.
    //
    // Esto evita:
    //
    // pie izquierdo Walk
    // -> salto
    // -> pie izquierdo Run otra vez
    //
    // Ahora la transición conserva el paso.
    // ==================================================

    if (
        moving &&
        !isThrowing
    ) {

        const cycleSpeed =
            THREE.MathUtils.lerp(

                WALK_CYCLE_SPEED,

                RUN_CYCLE_SPEED,

                runBlend

            );


        gaitPhase +=
            delta *
            cycleSpeed;


        gaitPhase =
            gaitPhase % 1;

    }


    const walkDuration =
        actions.walk
            .getClip()
            .duration;


    const runDuration =
        actions.run
            .getClip()
            .duration;


    actions.walk.time =
        gaitPhase *
        walkDuration;


    actions.run.time =
        gaitPhase *
        runDuration;


    // ==================================================
    // THROW BLEND
    // ==================================================

    throwBlend =
        THREE.MathUtils.damp(

            throwBlend,

            isThrowing ? 1 : 0,

            THROW_BLEND_SPEED,

            delta

        );


    const locomotionWeight =
        1 -
        throwBlend;


    // ==================================================
    // PESOS DE LOCOMOCIÓN
    // ==================================================

    const idleWeight =
        (
            1 -
            movementBlend
        )
        *
        locomotionWeight;


    const walkWeight =
        movementBlend
        *
        (
            1 -
            runBlend
        )
        *
        locomotionWeight;


    const runWeight =
        movementBlend
        *
        runBlend
        *
        locomotionWeight;


    actions.idle.setEffectiveWeight(
        idleWeight
    );


    actions.walk.setEffectiveWeight(
        walkWeight
    );


    actions.run.setEffectiveWeight(
        runWeight
    );


    actions.throw.setEffectiveWeight(
        throwBlend
    );


    // ==================================================
    // TERMINAR THROW DESPUÉS DEL FADE
    // ==================================================

    if (
        !isThrowing &&
        throwBlend < 0.01 &&
        actions.throw.paused
    ) {

        actions.throw.stop();

        actions.throw.paused =
            false;

        actions.throw.setEffectiveWeight(
            0
        );

    }

}


// ======================================================
// ROTACIÓN SUAVE
// ======================================================

function smoothAngle(
    current,
    target,
    factor
) {

    const difference =
        Math.atan2(

            Math.sin(
                target - current
            ),

            Math.cos(
                target - current
            )

        );


    return (
        current +
        difference *
        factor
    );

}


// ======================================================
// ACTUALIZAR PERSONAJE
// ======================================================

function updateCharacter(
    delta
) {

    if (
        !characterReady ||
        !characterBody ||
        !characterController
    ) {

        return;

    }


    camera.getWorldDirection(
        forward
    );


    forward.y =
        0;


    if (
        forward.lengthSq() > 0
    ) {

        forward.normalize();

    }


    side
        .crossVectors(
            forward,
            camera.up
        )
        .normalize();


    desired.set(
        0,
        -GRAVITY_STEP * delta,
        0
    );


    move.set(
        0,
        0,
        0
    );


    if (
        keyStates.KeyW
    ) {

        move.add(
            forward
        );

    }


    if (
        keyStates.KeyS
    ) {

        move.sub(
            forward
        );

    }


    if (
        keyStates.KeyD
    ) {

        move.add(
            side
        );

    }


    if (
        keyStates.KeyA
    ) {

        move.sub(
            side
        );

    }


    const running =
        keyStates.ShiftLeft ||
        keyStates.ShiftRight;


    const speed =
        running
            ?
            RUN_SPEED
            :
            WALK_SPEED;


    if (
        move.lengthSq() > 0
    ) {

        move.normalize();


        desired.addScaledVector(
            move,
            speed * delta
        );


        const targetYaw =
            Math.atan2(
                move.x,
                move.z
            );


        character.rotation.y =
            smoothAngle(

                character.rotation.y,

                targetYaw,

                Math.min(
                    1,
                    delta * 8
                )

            );

    }


    // ==================================================
    // RAPIER CHARACTER CONTROLLER
    // ==================================================

    characterController
        .computeColliderMovement(
            characterCollider,
            desired
        );


    const corrected =
        characterController
            .computedMovement();


    const position =
        characterBody
            .translation();


    characterBody
        .setNextKinematicTranslation({

            x:
                position.x +
                corrected.x,

            y:
                position.y +
                corrected.y,

            z:
                position.z +
                corrected.z

        });

}


// ======================================================
// SINCRONIZAR MODELO
// ======================================================

function syncCharacter(
    force = false
) {

    if (
        !character ||
        !characterBody
    ) {

        return;

    }


    const position =
        characterBody
            .translation();


    currentCharacterPosition.set(
        position.x,
        position.y,
        position.z
    );


    characterMoveDelta
        .subVectors(
            currentCharacterPosition,
            lastCharacterPosition
        );


    const groundY =
        position.y -
        CHARACTER_FOOT_OFFSET;


    character.position.set(

        position.x,

        groundY -
        characterVisualMinY,

        position.z

    );


    if (
        force ||
        characterMoveDelta.lengthSq() > 0
    ) {

        camera.position.add(
            characterMoveDelta
        );

    }


    controls.target.set(
        position.x,
        groundY + 0.9,
        position.z
    );


    lastCharacterPosition.copy(
        currentCharacterPosition
    );

}


// ======================================================
// CREAR CAJA CON FÍSICA MEJORADA
// ======================================================

function createBox(
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    mass = 10
) {

    const mesh =
        new THREE.Mesh(

            new THREE.BoxGeometry(
                sx,
                sy,
                sz
            ),

            new THREE.MeshStandardMaterial({

                color:
                    0x9aa7b8,

                roughness:
                    0.72,

                metalness:
                    0.03

            })

        );


    mesh.castShadow =
        true;

    mesh.receiveShadow =
        true;


    scene.add(
        mesh
    );


    // ==================================================
    // BODY
    // ==================================================

    const bodyDesc =
        RAPIER.RigidBodyDesc
            .dynamic()
            .setTranslation(
                x,
                y,
                z
            )
            .setLinearDamping(
                0.22
            )
            .setAngularDamping(
                0.35
            );


    // CCD evita que objetos rápidos atraviesen
    // otros colliders.

    if (
        typeof bodyDesc.setCcdEnabled
        ===
        'function'
    ) {

        bodyDesc.setCcdEnabled(
            true
        );

    }


    const body =
        physicsWorld.createRigidBody(
            bodyDesc
        );


    // ==================================================
    // COLLIDER EXACTO
    // ==================================================

    const colliderDesc =
        RAPIER.ColliderDesc
            .cuboid(
                sx / 2,
                sy / 2,
                sz / 2
            )
            .setMass(
                mass
            )
            .setFriction(
                0.95
            )
            .setRestitution(
                0.04
            );


    physicsWorld.createCollider(
        colliderDesc,
        body
    );


    dynamicObjects.push({

        mesh,

        body

    });

}


// ======================================================
// PIRÁMIDE
// ======================================================

function createStreetPyramid() {

    const boxSize =
        0.72;


    const spacing =
        boxSize +
        0.06;


    const right =
        new THREE.Vector3(

            -streetForward.z,

            0,

            streetForward.x

        )
            .normalize();


    for (
        let level = 0;
        level < 3;
        level++
    ) {

        const count =
            3 - level;


        const offset =
            (
                (
                    count - 1
                )
                *
                spacing
            )
            /
            2;


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const lateral =
                i * spacing -
                offset;


            const position =
                pyramidSpawn
                    .clone()
                    .addScaledVector(
                        right,
                        lateral
                    );


            const y =
                pyramidSpawn.y
                +
                boxSize / 2
                +
                level
                *
                (
                    boxSize +
                    0.025
                );


            createBox(

                position.x,

                y,

                position.z,

                boxSize,

                boxSize,

                boxSize,

                12

            );

        }

    }

}


// ======================================================
// CREAR PROYECTIL
// ======================================================

function spawnProjectile() {

    if (
        !character ||
        !characterBody
    ) {

        return;

    }


    const characterPosition =
        characterBody
            .translation();


    const direction =
        new THREE.Vector3(
            0,
            0,
            1
        )
            .applyQuaternion(
                character.quaternion
            )
            .normalize();


    const mesh =
        new THREE.Mesh(

            new THREE.SphereGeometry(
                PROJECTILE_RADIUS,
                20,
                20
            ),

            new THREE.MeshStandardMaterial({

                color:
                    0x22d3ee,

                emissive:
                    0x063b49,

                emissiveIntensity:
                    1.5,

                roughness:
                    0.3

            })

        );


    mesh.castShadow =
        true;


    scene.add(
        mesh
    );


    // ==================================================
    // APARECE DELANTE DEL CUERPO
    // ==================================================
    //
    // Más lejos que antes para evitar que nazca
    // dentro del collider del personaje.
    // ==================================================

    const start =
        new THREE.Vector3(

            characterPosition.x,

            characterPosition.y + 0.28,

            characterPosition.z

        )
            .addScaledVector(
                direction,
                0.95
            );


    const bodyDesc =
        RAPIER.RigidBodyDesc
            .dynamic()
            .setTranslation(
                start.x,
                start.y,
                start.z
            )
            .setLinearDamping(
                0.02
            );


    if (
        typeof bodyDesc.setCcdEnabled
        ===
        'function'
    ) {

        bodyDesc.setCcdEnabled(
            true
        );

    }


    const body =
        physicsWorld
            .createRigidBody(
                bodyDesc
            );


    physicsWorld.createCollider(

        RAPIER.ColliderDesc
            .ball(
                PROJECTILE_RADIUS
            )
            .setMass(
                0.8
            )
            .setRestitution(
                0.25
            )
            .setFriction(
                0.4
            ),

        body

    );


    body.setLinvel(

        {

            x:
                direction.x *
                PROJECTILE_SPEED,

            y:
                1.3,

            z:
                direction.z *
                PROJECTILE_SPEED

        },

        true

    );


    dynamicObjects.push({

        mesh,

        body

    });

}


// ======================================================
// INICIAR THROW
// ======================================================

function throwObject() {

    if (
        !characterReady ||
        !actions.throw ||
        isThrowing ||
        !canThrow
    ) {

        return;

    }


    isThrowing =
        true;


    canThrow =
        false;


    throwReleased =
        false;


    const throwAction =
        actions.throw;


    throwAction.stop();


    throwAction.enabled =
        true;


    throwAction.paused =
        false;


    throwAction.setEffectiveWeight(
        1
    );


    throwAction.setEffectiveTimeScale(
        1
    );


    throwAction.reset();


    throwAction.play();

}


// ======================================================
// CONTROL EXACTO DE THROW
// ======================================================

function updateThrowTiming() {

    if (
        !isThrowing ||
        !actions.throw
    ) {

        return;

    }


    const throwAction =
        actions.throw;


    // ==================================================
    // FINAL VISUAL REAL
    // ==================================================
    //
    // Ya no esperamos:
    //
    // - setTimeout
    // - evento finished
    // - duración completa con frames muertos
    //
    // Cuando la animación alcanza su último movimiento
    // real, se lanza la pelota.
    // ==================================================

    if (
        !throwReleased &&
        throwAction.time >=
        throwVisualEndTime - 0.015
    ) {

        throwReleased =
            true;


        // PELOTA AHORA.

        spawnProjectile();


        // Congelamos el último frame únicamente
        // mientras desaparece suavemente.

        throwAction.paused =
            true;


        isThrowing =
            false;


        canThrow =
            true;

    }

}


// ======================================================
// SINCRONIZAR OBJETOS
// ======================================================

function syncDynamicObjects() {

    for (
        const item
        of dynamicObjects
    ) {

        const position =
            item.body.translation();


        const rotation =
            item.body.rotation();


        item.mesh.position.set(
            position.x,
            position.y,
            position.z
        );


        item.mesh.quaternion.set(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w
        );

    }

}


// ======================================================
// INICIALIZAR
// ======================================================

async function initializeGame() {

    try {


        // 1. Ciudad + colliders.

        await loadCity();


        // 2. Física del jugador.

        createCharacterPhysics();


        // 3. Pirámide.

        createStreetPyramid();


        // 4. Personaje + animaciones.

        await loadCharacter();


        console.log(
            'Juego inicializado correctamente.'
        );

    }

    catch (
        error
    ) {

        console.error(
            'Error inicializando el juego:',
            error
        );

    }

}


// ======================================================
// LOOP PRINCIPAL
// ======================================================

function animate() {

    timer.update();


    const delta =
        Math.min(
            0.033,
            timer.getDelta()
        );


    // ==================================================
    // MOVIMIENTO DEL JUGADOR
    // ==================================================

    updateCharacter(
        delta
    );


    // ==================================================
    // ANIMACIONES DE LOCOMOCIÓN
    // ==================================================

    updateLocomotionAnimation(
        delta
    );


    // ==================================================
    // FÍSICAS
    // ==================================================
    //
    // Substeps mejoran notablemente:
    //
    // - cajas
    // - proyectiles
    // - choques
    // - estabilidad
    //
    // ==================================================

    const maxPhysicsStep =
        1 / 120;


    const subSteps =
        Math.max(

            1,

            Math.ceil(
                delta /
                maxPhysicsStep
            )

        );


    const physicsDelta =
        delta /
        subSteps;


    for (
        let i = 0;
        i < subSteps;
        i++
    ) {

        physicsWorld.timestep =
            physicsDelta;


        physicsWorld.step();

    }


    // ==================================================
    // ANIMATION MIXER
    // ==================================================

    if (
        mixer
    ) {

        mixer.update(
            delta
        );

    }


    // ==================================================
    // THROW
    // ==================================================
    //
    // Se comprueba DESPUÉS de mixer.update(),
    // porque ahora action.time ya representa
    // exactamente el frame actual.
    // ==================================================

    updateThrowTiming();


    // ==================================================
    // SINCRONIZAR
    // ==================================================

    syncCharacter();


    syncDynamicObjects();


    // ==================================================
    // CÁMARA
    // ==================================================

    controls.update();


    // ==================================================
    // RENDER
    // ==================================================

    renderer.render(
        scene,
        camera
    );

}


// ======================================================
// ANIMATION LOOP
// ======================================================

renderer.setAnimationLoop(
    animate
);


// ======================================================
// RESPONSIVE
// ======================================================

window.addEventListener(
    'resize',
    () => {


        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );


        renderer.setPixelRatio(

            Math.min(
                window.devicePixelRatio,
                2
            )

        );

    }
);


// ======================================================
// INICIAR JUEGO
// ======================================================

initializeGame();