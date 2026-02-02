"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useRouter } from "next/navigation";
import MarkerClusterGroup from "react-leaflet-markercluster";
import pois from "../data/pois.json";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

/* Simple div icon for markers */
const DefaultIcon = L.divIcon({
  className: "custom-marker",
  html: '<div style="background:#2B6CB0;width:18px;height:18px;border-radius:50%;border:3px solid white"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/* Fit map to bounds of points */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

/* Geolocate button rendered inside the MapContainer (so useMap works) */
function GeolocateButtonInsideMap() {
  const map = useMap();
  const onClick = () => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        map.setView([lat, lon], 16, { animate: true });
        const marker = L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: "#2B6CB0",
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9,
        }).addTo(map);
        setTimeout(() => marker.remove(), 6000);
      },
      (err) => {
        console.warn("Geolocation error", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <button
      onClick={onClick}
      aria-label="Centrar mapa na sua localização"
      title="Centrar em mim"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 1000,
        background: "white",
        border: "1px solid #ddd",
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
      }}
    >
      📍
    </button>
  );
}

export default function POIMap() {
  const router = useRouter();
  const points: [number, number][] = useMemo(
    () =>
      pois
        .filter((p) => Array.isArray(p.coords) && p.coords.length === 2)
        .map((p) => [p.coords[0], p.coords[1]] as [number, number]),
    []
  );

  const mapRef = useRef<L.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<"osm" | "toner">("osm");
  const [tonerAttempt, setTonerAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  // Providers to try for "Toner" style (fallback sequence)
  const tonerProviders = [
    {
      id: "stamen-toner-lite",
      url: "https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png",
      attribution: "© Stamen Toner Lite",
      maxZoom: 20,
    },
    {
      id: "stamen-toner",
      url: "https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png",
      attribution: "© Stamen Toner",
      maxZoom: 20,
    },
    {
      id: "carto-dark",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      attribution: "© CartoDB",
      maxZoom: 19,
    },
  ];

  /* cluster icon */
  const createClusterIcon = (cluster: any) => {
    const count = cluster.getChildCount();
    const size = count < 10 ? 36 : count < 50 ? 44 : count < 200 ? 52 : 64;
    const html = `
      <div style="
        background: radial-gradient(circle at 30% 30%, #4c9be8, #2B6CB0);
        width:${size}px;height:${size}px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:700;box-shadow:0 4px 10px rgba(0,0,0,0.25);
        border:3px solid rgba(255,255,255,0.85);
      ">
        ${count}
      </div>
    `;
    return L.divIcon({
      html,
      className: "custom-cluster-icon",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  /* when map is created, keep reference for other uses (optional) */
  const handleMapCreated = (map: L.Map) => {
    mapRef.current = map;
    if (typeof map.options.maxZoom === "undefined") {
      map.options.maxZoom = 19;
    }
  };

  /* Reset attempts when user explicitly selects Toner */
  useEffect(() => {
    if (activeLayer === "toner") {
      setTonerAttempt(0);
      setMessage("Carregando camada Toner...");
    } else {
      setMessage(null);
    }
  }, [activeLayer]);

  /* Handler for tile errors: try next provider or fallback to OSM */
  const handleTonerTileError = (ev: any) => {
    console.warn("Toner tileerror:", ev?.url || ev);
    const next = tonerAttempt + 1;
    if (next < tonerProviders.length) {
      setTonerAttempt(next);
      setMessage(`Toner falhou, tentando alternativa (${next + 1}/${tonerProviders.length})...`);
    } else {
      setActiveLayer("osm");
      setMessage("Toner indisponível. Revertendo para OSM.");
      setTimeout(() => setMessage(null), 3500);
      // ensure map redraw
      setTimeout(() => mapRef.current?.invalidateSize(), 300);
    }
  };

  /* Handler for successful load of toner tiles */
  const handleTonerLoad = () => {
    setMessage(null);
    console.info("Toner tiles carregando com sucesso");
    // force redraw to ensure tiles visible
    setTimeout(() => mapRef.current?.invalidateSize(), 150);
  };

  return (
    <div style={{ marginTop: 20, position: "relative" }}>
      {/* small message banner */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 8,
            zIndex: 1200,
            background: "rgba(0,0,0,0.75)",
            color: "white",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          {message}
        </div>
      )}

      <MapContainer
        center={points[0] || [49.4431, 1.0993]}
        zoom={14}
        scrollWheelZoom
        style={{ height: 520, width: "100%" }}
        className="leaflet-container"
        aria-label="Mapa de pontos de interesse"
        role="application"
        whenCreated={handleMapCreated}
        maxZoom={20}
      >
        {/* OSM TileLayer (always mounted, visibility controlled by activeLayer) */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
          opacity={activeLayer === "osm" ? 1 : 0}
        />

        {/* Toner / alternative providers: mount the currently attempted provider */}
        {activeLayer === "toner" && (
          <TileLayer
            key={tonerAttempt} // force remount when attempt changes
            url={tonerProviders[tonerAttempt].url}
            attribution={tonerProviders[tonerAttempt].attribution}
            maxZoom={tonerProviders[tonerAttempt].maxZoom}
            crossOrigin="anonymous"
            detectRetina={true}
            eventHandlers={{
              tileerror: (ev) => handleTonerTileError(ev),
              load: () => handleTonerLoad(),
            }}
          />
        )}

        <FitBounds points={points} />

        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
          iconCreateFunction={createClusterIcon}
          // @ts-ignore
          spiderfyDistanceMultiplier={1.2}
        >
          {pois.map((p) =>
            Array.isArray(p.coords) && p.coords.length === 2 ? (
              <Marker
                key={p.id}
                position={[p.coords[0], p.coords[1]]}
                // @ts-ignore
                icon={DefaultIcon}
                keyboard={true}
                title={p.title}
              >
                <Popup>
                  <div style={{ maxWidth: 300, display: "flex", gap: 10 }}>
                    <img
                      src={p.image || "/images/placeholder.jpg"}
                      alt={p.title}
                      style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 6 }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: "block", marginBottom: 6 }}>{p.title}</strong>
                      <p style={{ margin: 0, fontSize: 13, color: "#444" }}>
                        {p.description
                          ? p.description.length > 140
                            ? p.description.slice(0, 137) + "..."
                            : p.description
                          : ""}
                      </p>
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => router.push(`/poi/${p.id}`)}
                          style={{
                            background: "#1f6feb",
                            color: "white",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                          aria-label={`Abrir página de ${p.title}`}
                        >
                          Abrir página
                        </button>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
        </MarkerClusterGroup>

        <GeolocateButtonInsideMap />
      </MapContainer>

      {/* Layer toggle control (outside MapContainer for layout simplicity) */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "#333" }}>Mapa</label>
        <button
          onClick={() => {
            setActiveLayer("osm");
            setMessage(null);
          }}
          aria-pressed={activeLayer === "osm"}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #ddd",
            background: activeLayer === "osm" ? "#eef6ff" : "white",
            cursor: "pointer",
          }}
        >
          OSM
        </button>
        <button
          onClick={() => {
            setMessage("Carregando camada Toner...");
            setActiveLayer("toner");
            setTonerAttempt(0);
          }}
          aria-pressed={activeLayer === "toner"}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #ddd",
            background: activeLayer === "toner" ? "#eef6ff" : "white",
            cursor: "pointer",
          }}
        >
          Toner
        </button>
        <div style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>Alternar camadas</div>
      </div>

      <style jsx>{`
        .custom-cluster-icon {
          transform-origin: center;
          transition: transform 160ms ease;
        }
        .leaflet-container:focus {
          outline: 3px solid rgba(43, 108, 176, 0.12);
        }
        .custom-marker {
          display: inline-block;
        }
      `}</style>
    </div>
  );
}
