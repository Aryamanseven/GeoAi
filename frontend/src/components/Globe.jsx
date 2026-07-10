import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import earcut from "earcut";
import FlagDisplay from "./FlagDisplay";

const COUNTRIES_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const TOPOJSON_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js";

let topojsonLoaderPromise;

async function loadTopojsonClient() {
  if (window.topojson) return window.topojson;
  if (!topojsonLoaderPromise) {
    topojsonLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[src="${TOPOJSON_SCRIPT_URL}"]`
      );
      if (existing) {
        if (window.topojson) {
          resolve(window.topojson);
          return;
        }
        existing.addEventListener("load", () => resolve(window.topojson));
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load topojson-client."))
        );
        return;
      }
      const script = document.createElement("script");
      script.src = TOPOJSON_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.topojson);
      script.onerror = () =>
        reject(new Error("Failed to load topojson-client."));
      document.head.appendChild(script);
    });
  }
  return topojsonLoaderPromise;
}

/* ─── coordinate helpers ─── */
function latLngTo3D(lat, lng, radius = 1.001) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function buildCountryGeometry(coordinates, radius = 1.001) {
  const allPositions = [];
  const allIndices = [];

  const subdivideTriangle = (v1, v2, v3, rad, depth) => {
    if (depth === 0) {
      const baseIndex = allPositions.length / 3;
      allPositions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
      allIndices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      return;
    }
    const m1 = new THREE.Vector3().addVectors(v1, v2).normalize().multiplyScalar(rad);
    const m2 = new THREE.Vector3().addVectors(v2, v3).normalize().multiplyScalar(rad);
    const m3 = new THREE.Vector3().addVectors(v3, v1).normalize().multiplyScalar(rad);
    subdivideTriangle(v1, m1, m3, rad, depth - 1);
    subdivideTriangle(m1, v2, m2, rad, depth - 1);
    subdivideTriangle(m3, m2, v3, rad, depth - 1);
    subdivideTriangle(m1, m2, m3, rad, depth - 1);
  };

  const processRings = (rings) => {
    const outerRing = rings[0];
    if (!outerRing || outerRing.length < 3) return;

    const flatCoords = [];
    const holes = [];
    
    let prevLng = null;
    const unwrapLng = (lng) => {
      if (prevLng !== null) {
        while (lng - prevLng > 180) lng -= 360;
        while (prevLng - lng > 180) lng += 360;
      }
      prevLng = lng;
      return lng;
    };

    outerRing.forEach(([lng, lat]) => {
      flatCoords.push(unwrapLng(lng), lat);
    });
    for (let h = 1; h < rings.length; h++) {
      holes.push(flatCoords.length / 2);
      prevLng = null; // Reset for each hole
      rings[h].forEach(([lng, lat]) => {
        flatCoords.push(unwrapLng(lng), lat);
      });
    }

    const triangles = earcut(flatCoords, holes.length ? holes : undefined, 2);
    if (!triangles.length) return;

    const ring3D = [];
    for (let i = 0; i < flatCoords.length; i += 2) {
      ring3D.push(latLngTo3D(flatCoords[i + 1], flatCoords[i], radius));
    }
    
    for (let i = 0; i < triangles.length; i += 3) {
      const v1 = ring3D[triangles[i]];
      const v2 = ring3D[triangles[i+1]];
      const v3 = ring3D[triangles[i+2]];
      
      const d1 = v1.distanceTo(v2);
      const d2 = v2.distanceTo(v3);
      const d3 = v3.distanceTo(v1);
      const maxD = Math.max(d1, d2, d3);
      
      let depth = 0;
      if (maxD > 0.4) depth = 3;
      else if (maxD > 0.2) depth = 2;
      else if (maxD > 0.08) depth = 1;
      
      subdivideTriangle(v1, v2, v3, radius, depth);
    }
  };

  if (!coordinates || !coordinates.length) return null;

  if (typeof coordinates[0][0][0] === "number") {
    processRings(coordinates);
  } else {
    coordinates.forEach((polygon) => processRings(polygon));
  }

  if (!allPositions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(allPositions, 3)
  );
  geometry.setIndex(allIndices);
  
  // Calculate perfect spherical normals (pointing outwards from center)
  const normals = [];
  for (let i = 0; i < allPositions.length; i += 3) {
    const x = allPositions[i];
    const y = allPositions[i + 1];
    const z = allPositions[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    normals.push(x / len, y / len, z / len);
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  
  return geometry;
}

function buildBorderLines(coordinates) {
  const positions = [];

  const processRing = (ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = latLngTo3D(ring[i][1], ring[i][0], 1.002);
      const b = latLngTo3D(ring[i + 1][1], ring[i + 1][0], 1.002);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  };

  if (!coordinates || !coordinates.length) return null;

  if (typeof coordinates[0][0][0] === "number") {
    coordinates.forEach((ring) => processRing(ring));
  } else {
    coordinates.forEach((polygon) =>
      polygon.forEach((ring) => processRing(ring))
    );
  }

  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return geometry;
}

function featureCentroid(feature) {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;
  const coords = feature.geometry.coordinates;

  const walkRing = (ring) => {
    ring.forEach(([lng, lat]) => {
      sumLng += lng;
      sumLat += lat;
      count++;
    });
  };

  if (feature.geometry.type === "Polygon") {
    coords.forEach((ring) => walkRing(ring));
  } else {
    coords.forEach((polygon) => polygon.forEach((ring) => walkRing(ring)));
  }

  return count ? { lat: sumLat / count, lng: sumLng / count } : { lat: 0, lng: 0 };
}

const REGION_CENTERS = {
  asia: { lat: 34, lng: 100, zoom: 2.2 },
  europe: { lat: 54, lng: 15, zoom: 1.8 },
  africa: { lat: 0, lng: 20, zoom: 2.0 },
  oceania: { lat: -25, lng: 140, zoom: 2.0 },
  north_america: { lat: 45, lng: -100, zoom: 2.0 },
  south_america: { lat: -15, lng: -60, zoom: 2.0 },
  world: { lat: 20, lng: 0, zoom: 2.5 },
};

const CONTINENT_MAP = {
  asia: "Asia",
  europe: "Europe",
  africa: "Africa",
  oceania: "Oceania",
  north_america: "North America",
  south_america: "South America",
};

const VINTAGE_COLORS = [
  "#D5A18E", // Faded Terracotta
  "#C3B19A", // Aged Khaki
  "#A5B8A4", // Dusty Sage
  "#D6C098", // Antique Gold
  "#BCA8B1", // Faded Plum
  "#97A9B4", // Faded Slate Blue
  "#CE9579", // Burnt Sienna
  "#B8B799", // Olive Drab
  "#D9B4A0", // Pale Copper
  "#A6B0A8", // Muted Seaweed
];

/* ═══════════════════════════════════════════════════════
   Globe Component
   ═══════════════════════════════════════════════════════ */
export default function Globe({
  countries = [],
  highlights = [],
  flyTo = null,
  focusRegion = null,
  namedCountries = [],
  capitalMarker = null,
  locationMarker = null,
  geoMarkers = [],
  width = 500,
  height = 500,
  onCountryClick = null,
}) {
  const mountRef = useRef(null);
  const labelsContainerRef = useRef(null);
  const internals = useRef({});
  const [ready, setReady] = useState(false);
  const [activeLabels, setActiveLabels] = useState([]); // Array of { id, text, lat, lng, type, color }

  /* ─── main setup effect ─── */
  useEffect(() => {
    let disposed = false;
    const container = mountRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Groups
    const globeGroup = new THREE.Group();
    const countryMeshGroup = new THREE.Group();
    const borderGroup = new THREE.Group();
    borderGroup.renderOrder = 1;
    const highlightGroup = new THREE.Group();
    highlightGroup.renderOrder = 2;

    scene.add(globeGroup);
    globeGroup.add(countryMeshGroup);
    globeGroup.add(borderGroup);
    globeGroup.add(highlightGroup);

    // Ocean sphere (Authentic aged parchment)
    const oceanSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 64, 64),
      new THREE.MeshPhongMaterial({ color: "#E5D9C5", shininess: 0 })
    );
    globeGroup.add(oceanSphere);

    // Atmosphere (soft vignette / vintage edge burn)
    globeGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.025, 64, 64),
        new THREE.MeshPhongMaterial({
          color: "#8C7B65",
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.BackSide,
        })
      )
    );

    // Graticules (Latitude & Longitude grid lines)
    const graticulePoints = [];
    const step = 15; // Grid spacing
    
    // Longitude lines
    for (let lng = -180; lng <= 180; lng += step) {
      for (let lat = -90; lat <= 90; lat += 2) {
        const p1 = latLngTo3D(lat, lng, 1.0005);
        const p2 = latLngTo3D(Math.min(90, lat + 2), lng, 1.0005);
        graticulePoints.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    // Latitude lines
    for (let lat = -90; lat <= 90; lat += step) {
      for (let lng = -180; lng <= 180; lng += 2) {
        const p1 = latLngTo3D(lat, lng, 1.0005);
        const p2 = latLngTo3D(lat, Math.min(180, lng + 2), 1.0005);
        graticulePoints.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    
    const graticuleGeo = new THREE.BufferGeometry();
    graticuleGeo.setAttribute('position', new THREE.Float32BufferAttribute(graticulePoints, 3));
    const graticuleLines = new THREE.LineSegments(
      graticuleGeo, 
      new THREE.LineBasicMaterial({ color: "#B3A38F", transparent: true, opacity: 0.4 })
    );
    globeGroup.add(graticuleLines);

    // No stars for vintage map aesthetic
    
    // Lighting (Warm vintage sunlight)
    const ambient = new THREE.AmbientLight(0xFFF6E5, 1.2);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xFFF6E5, 0.4);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    // Interaction state
    const rotation = { x: 0.3, y: -0.4 };
    const drag = { active: false, x: 0, y: 0 };
    let tween = null;
    let zoomTween = null;
    const countryMeshes = []; // {mesh, isoNum}
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e) => {
      drag.active = true;
      drag.x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      drag.y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    };
    const onPointerMove = (e) => {
      if (!drag.active) return;
      const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const dx = cx - drag.x;
      const dy = cy - drag.y;
      drag.x = cx;
      drag.y = cy;
      tween = null;
      rotation.y += dx * 0.005;
      rotation.x = clamp(rotation.x + dy * 0.005, -1.2, 1.2);
    };
    const onPointerUp = () => {
      drag.active = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = clamp(camera.position.z + e.deltaY * 0.002, 1.8, 5.0);
      zoomTween = null;
    };

    const onClick = (e) => {
      if (!onCountryClick) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes = countryMeshes.map((cm) => cm.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        const hitMesh = hits[0].object;
        const entry = countryMeshes.find((cm) => cm.mesh === hitMesh);
        if (entry) onCountryClick(entry.isoNum);
      }
    };

    renderer.domElement.addEventListener("mousedown", onPointerDown);
    renderer.domElement.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("touchmove", onPointerMove, { passive: true });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("click", onClick);

    // Store internals
    internals.current = {
      scene,
      camera,
      renderer,
      globeGroup,
      countryMeshGroup,
      borderGroup,
      highlightGroup,
      rotation,
      drag,
      get tween() { return tween; },
      set tween(v) { tween = v; },
      get zoomTween() { return zoomTween; },
      set zoomTween(v) { zoomTween = v; },
      countryMeshes,
      features: [],
      labelsState: [],
      geoMarkerMeshes: [],
    };

    // Animate
    let frameId;
    const projVec = new THREE.Vector3();
    const animate = (timestamp) => {
      if (disposed) return;

      if (tween) {
        const { fromX, fromY, toX, toY, start, duration } = tween;
        const p = clamp((timestamp - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        rotation.x = fromX + (toX - fromX) * eased;
        
        // Handle shortest path for Y rotation
        let diffY = toY - fromY;
        while (diffY > Math.PI) diffY -= 2 * Math.PI;
        while (diffY < -Math.PI) diffY += 2 * Math.PI;
        rotation.y = fromY + diffY * eased;
        
        if (p >= 1) tween = null;
      } else if (!drag.active) {
        rotation.y += 0.0008;
      }

      if (zoomTween) {
        const { fromZ, toZ, start, duration } = zoomTween;
        const p = clamp((timestamp - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        camera.position.z = fromZ + (toZ - fromZ) * eased;
        if (p >= 1) zoomTween = null;
      }

      globeGroup.rotation.x = rotation.x;
      globeGroup.rotation.y = rotation.y;
      renderer.render(scene, camera);

      // Update HTML labels positions
      if (labelsContainerRef.current && mountRef.current) {
        const children = labelsContainerRef.current.children;
        const hw = mountRef.current.clientWidth / 2;
        const hh = mountRef.current.clientHeight / 2;
        
        internals.current.labelsState.forEach((lbl, idx) => {
          const el = children[idx];
          if (!el) return;
          
          projVec.copy(lbl.vec3).applyMatrix4(globeGroup.matrixWorld);
          
          // Check if point is facing camera (z > 0 in view space)
          const viewPos = projVec.clone().applyMatrix4(camera.matrixWorldInverse);
          const isVisible = viewPos.z < 0; // Negative Z is forward in Three.js camera
          
          if (isVisible) {
            projVec.project(camera);
            const x = (projVec.x * hw) + hw;
            const y = -(projVec.y * hh) + hh;
            el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
            el.style.opacity = "1";
            el.style.pointerEvents = "auto";
          } else {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
          }
        });
      }

      // Pulse geoMarker meshes
      const elapsed = timestamp * 0.001;
      if (internals.current.geoMarkerMeshes) {
        internals.current.geoMarkerMeshes.forEach(({ mesh, pulse }) => {
          if (pulse) {
            const s = 1 + 0.4 * Math.sin(elapsed * 4.2);
            mesh.scale.set(s, s, s);
          }
        });
      }

      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    // Load world data
    (async () => {
      try {
        const topojson = await loadTopojsonClient();
        const res = await fetch(COUNTRIES_URL);
        const topology = await res.json();
        const features = topojson.feature(
          topology,
          topology.objects.countries
        ).features;

        if (disposed) return;
        internals.current.features = features;

        // Build country meshes
        features.forEach((feature) => {
          const coords =
            feature.geometry.type === "Polygon"
              ? feature.geometry.coordinates
              : feature.geometry.coordinates;

          const geo = buildCountryGeometry(
            feature.geometry.type === "Polygon"
              ? [coords]
              : coords,
            1.001
          );
          if (geo) {
            // Use a prime multiplier to scatter colors and avoid adjacent clumping
            const colorIndex = (parseInt(feature.id, 10) * 73 + 17) % VINTAGE_COLORS.length;
            const baseColor = VINTAGE_COLORS[colorIndex] || "#D8C9B3";
            const mesh = new THREE.Mesh(
              geo,
              new THREE.MeshPhongMaterial({
                color: baseColor,
                shininess: 0,
                transparent: true,
                opacity: 1.0,
                side: THREE.DoubleSide,
              })
            );
            mesh.renderOrder = 0;
            countryMeshGroup.add(mesh);
            countryMeshes.push({ mesh, isoNum: String(feature.id) });
          }

          // Borders
          const borderGeo = buildBorderLines(coords);
          if (borderGeo) {
            const lines = new THREE.LineSegments(
              borderGeo,
              new THREE.LineBasicMaterial({ color: "#6B5C4B", linewidth: 1, transparent: true, opacity: 0.5 })
            );
            lines.renderOrder = 1;
            borderGroup.add(lines);
          }
        });

        setReady(true);
      } catch (err) {
        console.error("Globe: failed to load world data", err);
      }
    })();

    // Cleanup
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("mousedown", onPointerDown);
      renderer.domElement.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("click", onClick);

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Resize effect ─── */
  useEffect(() => {
    const { renderer, camera } = internals.current;
    if (!renderer || !camera || !mountRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        let { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    });
    
    resizeObserver.observe(mountRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  /* ─── Focus Region & FlyTo effect ─── */
  useEffect(() => {
    if (!ready || !internals.current.rotation) return;
    
    // Determine priority flyTo target
    let target = null;
    let targetZoom = 2.5;

    if (flyTo?.lat != null && flyTo?.lng != null) {
      target = flyTo;
      targetZoom = 1.8; // zoom in more for specific points
    } else if (focusRegion && REGION_CENTERS[focusRegion]) {
      target = REGION_CENTERS[focusRegion];
      targetZoom = REGION_CENTERS[focusRegion].zoom;
    }

    if (target) {
      const latRad = THREE.MathUtils.degToRad(target.lat);
      const lngRad = THREE.MathUtils.degToRad(target.lng);
      internals.current.tween = {
        fromX: internals.current.rotation.x,
        fromY: internals.current.rotation.y,
        toX: clamp(latRad, -1.2, 1.2),
        toY: -lngRad,
        start: performance.now(),
        duration: 1200,
      };
      
      internals.current.zoomTween = {
        fromZ: internals.current.camera.position.z,
        toZ: targetZoom,
        start: performance.now(),
        duration: 1200,
      };
    }
  }, [flyTo?.lat, flyTo?.lng, focusRegion, ready]);

  /* ─── Highlights, Dimming, Named Countries effect ─── */
  useEffect(() => {
    const {
      highlightGroup,
      countryMeshGroup,
      countryMeshes,
      features,
    } = internals.current;
    if (!highlightGroup || !features?.length || !ready) return;

    // Build region isoNums map
    const targetContinent = CONTINENT_MAP[focusRegion];
    const regionIsoNums = new Set();
    if (targetContinent && countries.length) {
      countries.forEach(c => {
        if (c.continent === targetContinent) {
          regionIsoNums.add(String(parseInt(c.isoNum, 10)));
        }
      });
    }

    // Build named map
    const namedMap = new Set(namedCountries.map(n => String(parseInt(n, 10))));

    // Build highlight set for quick lookup
    const highlightMap = {};
    highlights.forEach((h) => {
      highlightMap[String(parseInt(h.isoNum, 10))] = h;
    });

    // Update country meshes colors & opacities
    if (countryMeshes) {
      countryMeshes.forEach(({ mesh, isoNum }) => {
        const normIso = String(parseInt(isoNum, 10));
        const h = highlightMap[normIso];
        const isNamed = namedMap.has(normIso);
        
        let inRegion = true;
        if (targetContinent) {
           inRegion = regionIsoNums.has(normIso);
        }

        mesh.material.opacity = (!targetContinent || inRegion) ? 1.0 : 0.15;
        
        if (h) {
          mesh.material.color.set(h.color || "#C87968");
          mesh.material.opacity = 1.0;
        } else if (isNamed) {
          mesh.material.color.set("#8BA89D"); // Soft warm sage for named
          mesh.material.opacity = 1.0;
        } else {
          const colorIndex = (parseInt(normIso, 10) * 73 + 17) % VINTAGE_COLORS.length;
          mesh.material.color.set(VINTAGE_COLORS[colorIndex] || "#D8C9B3");
        }
      });
    }

    // Prepare labels
    const newLabels = [];

    // Named countries labels
    if (namedCountries.length > 0) {
      namedCountries.forEach(iso => {
        const c = countries.find(x => String(parseInt(x.isoNum, 10)) === String(parseInt(iso, 10)));
        if (c) {
          newLabels.push({
            id: `named-${iso}`,
            text: c.name,
            lat: c.lat,
            lng: c.lng,
            type: 'named',
            vec3: latLngTo3D(c.lat, c.lng, 1.01)
          });
        }
      });
    }

    // Add marker spheres and point lights
    while (highlightGroup.children.length) {
      const child = highlightGroup.children[0];
      highlightGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    // Clear old geoMarker meshes
    internals.current.geoMarkerMeshes = [];

    highlights.forEach((h) => {
      const feature = features.find((f) => String(parseInt(f.id, 10)) === String(parseInt(h.isoNum, 10)));
      if (!feature) return;

      const center = featureCentroid(feature);
      const pos = latLngTo3D(center.lat, center.lng, 1.025);

      const markerGeo = new THREE.SphereGeometry(0.025, 16, 16);
      const markerMat = new THREE.MeshPhongMaterial({
        color: h.color || "#C87968",
        shininess: 5,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(pos);
      highlightGroup.add(marker);
    });

    // Render geoMarkers (oceans, seas, peaks, ranges)
    const geoMeshes = [];
    geoMarkers.forEach((gm) => {
      const pos = latLngTo3D(gm.lat, gm.lng, 1.015);
      let markerColor = gm.color || "#3b82f6";
      if (gm.correct === true) markerColor = "#22c55e";
      else if (gm.correct === false) markerColor = "#ef4444";

      let geo;
      let radius;
      if (gm.type === "ocean" || gm.type === "sea" || gm.type === "strait") {
        radius = gm.type === "ocean" ? 0.04 : 0.03;
        geo = new THREE.SphereGeometry(radius, 16, 16);
      } else if (gm.type === "peak") {
        radius = 0.02;
        geo = new THREE.ConeGeometry(0.015, 0.04, 8);
      } else if (gm.type === "range") {
        radius = 0.03;
        geo = new THREE.ConeGeometry(0.02, 0.05, 6);
      } else {
        radius = 0.025;
        geo = new THREE.SphereGeometry(radius, 16, 16);
      }

      const mat = new THREE.MeshPhongMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.9,
        shininess: 5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      if (gm.type === "peak" || gm.type === "range") {
        mesh.lookAt(new THREE.Vector3(0, 0, 0));
        mesh.rotateX(Math.PI);
      }
      highlightGroup.add(mesh);
      geoMeshes.push({ mesh, pulse: gm.correct === null });
    });
    internals.current.geoMarkerMeshes = geoMeshes;

    if (capitalMarker) {
      newLabels.push({
        id: `capital-${capitalMarker.name}`,
        text: capitalMarker.name,
        lat: capitalMarker.lat,
        lng: capitalMarker.lng,
        type: 'capital',
        vec3: latLngTo3D(capitalMarker.lat, capitalMarker.lng, 1.03)
      });
    }

    if (locationMarker) {
      newLabels.push({
        id: `location-${locationMarker.label}`,
        text: locationMarker.label,
        lat: locationMarker.lat,
        lng: locationMarker.lng,
        type: 'location',
        color: locationMarker.color,
        vec3: latLngTo3D(locationMarker.lat, locationMarker.lng, 1.03)
      });
    }

    // GeoMarker labels
    geoMarkers.forEach((gm) => {
      let labelColor = gm.type === "peak" || gm.type === "range" ? "#f97316" : "#3b82f6";
      if (gm.correct === true) labelColor = "#22c55e";
      else if (gm.correct === false) labelColor = "#ef4444";
      newLabels.push({
        id: `geo-${gm.name}`,
        text: gm.name,
        lat: gm.lat,
        lng: gm.lng,
        type: 'geo',
        color: labelColor,
        pulse: gm.correct === null,
        geoType: gm.type,
        vec3: latLngTo3D(gm.lat, gm.lng, 1.04)
      });
    });

    setActiveLabels(newLabels);
    internals.current.labelsState = newLabels;

  }, [highlights, ready, focusRegion, namedCountries, capitalMarker, locationMarker, countries, geoMarkers]);

  /* ─── Info Cards ─── */
  const infoCards = highlights.filter((h) => h.country);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mountRef}
        style={{ cursor: "grab" }}
        className="rounded-[28px] overflow-hidden w-full h-full"
      />

      {/* HTML overlay for markers and labels */}
      <div 
        ref={labelsContainerRef} 
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        {activeLabels.map((lbl) => {
           if (lbl.type === 'geo') {
             const isMountainType = lbl.geoType === 'peak' || lbl.geoType === 'range';
             return (
               <div key={lbl.id} className="absolute flex flex-col items-center justify-center transition-opacity duration-200">
                 {isMountainType ? (
                   <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent" style={{ borderBottomColor: lbl.color }} />
                 ) : (
                   <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                 )}
                 <span className="mt-0.5 px-1.5 py-0.5 rounded bg-[#FDFCFB]/90 backdrop-blur text-[10px] whitespace-nowrap border border-[#D9CBB8] font-medium" style={{ color: "#2C2C2B" }}>
                   {lbl.text}
                 </span>
               </div>
             );
           }
           if (lbl.type === 'capital') {
            return (
              <div key={lbl.id} className="absolute flex flex-col items-center justify-center transition-opacity duration-200">
                <div className="w-2.5 h-2.5 rounded-full bg-[#C87968]" />
                <span className="mt-1 px-2 py-0.5 rounded bg-[#FDFCFB]/90 backdrop-blur text-[#2C2C2B] text-xs whitespace-nowrap border border-[#D9CBB8]">
                  {lbl.text}
                </span>
              </div>
            );
          } else if (lbl.type === 'location') {
            const isMountain = lbl.color === '#c2824a';
            return (
              <div key={lbl.id} className="absolute flex flex-col items-center justify-center transition-opacity duration-200">
                {isMountain ? (
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-[#C87968]" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-[#C87968]" />
                )}
                <span className="mt-1 px-2 py-0.5 rounded bg-[#FDFCFB]/90 backdrop-blur text-[#2C2C2B] text-xs whitespace-nowrap border border-[#D9CBB8] font-medium">
                  {lbl.text}
                </span>
              </div>
            );
          } else if (lbl.type === 'named') {
            return (
              <div key={lbl.id} className="absolute transition-opacity duration-200">
                <span className="px-1.5 py-0.5 rounded text-[#2C2C2B] font-bold text-[10px] bg-[#8BA89D]/90 backdrop-blur border border-[#D9CBB8] whitespace-nowrap">
                  {lbl.text}
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>

      {infoCards.length > 0 && (
        <div className="mt-4 space-y-3 relative z-10">
          {infoCards.map((h, idx) => (
            <div
              key={h.isoNum || idx}
              style={{
                background: "#0d1b2a",
                borderLeft: `4px solid ${h.color || "#ef5350"}`,
                padding: idx === 0 ? "18px 20px" : "14px 16px",
                borderRadius: 16,
              }}
              className="flex items-start gap-4 shadow-xl"
            >
              <FlagDisplay iso2={h.iso2} emoji={h.flag} size={idx === 0 ? "md" : "sm"} />
              <div className="flex-1 min-w-0">
                <h4
                  className="text-white font-semibold"
                  style={{ fontSize: idx === 0 ? 20 : 16 }}
                >
                  {h.country}
                </h4>
                {h.capital && (
                  <p className="text-sm text-slate-300 mt-1">
                    🏛 {h.capital}
                  </p>
                )}
                {h.continent && (
                  <p className="text-sm text-slate-400">
                    🌍 {h.continent}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
