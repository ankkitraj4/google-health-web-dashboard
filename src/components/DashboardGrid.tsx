import { createElement, useCallback, useEffect, useState } from 'react';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout';
import { WIDGET_REGISTRY, WIDGET_TYPES } from '../widgets/registry';
import {
  loadInstances,
  saveInstances,
  createInstanceId,
  getDefaultInstances,
  type WidgetInstance,
} from '../widgets/store';

const LAYOUT_KEY = 'dashboard_layout_v5';

function loadLayouts(): ResponsiveLayouts {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors and fall back to an empty layout.
  }
  return {};
}

function saveLayouts(layouts: ResponsiveLayouts) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
}

function defaultLayoutForInstance(instance: WidgetInstance, index: number, cols: number): LayoutItem {
  const def = WIDGET_REGISTRY[instance.type];
  if (!def) return { i: instance.id, x: 0, y: index * 5, w: 4, h: 5, minW: 3, minH: 3 };
  const perRow = Math.floor(cols / def.defaultW);
  return {
    i: instance.id,
    x: (index % perRow) * def.defaultW,
    y: Math.floor(index / perRow) * def.defaultH,
    w: def.defaultW,
    h: def.defaultH,
    minW: def.minW,
    minH: def.minH,
  };
}

function ensureLayoutsForInstances(layouts: ResponsiveLayouts, instances: WidgetInstance[]): ResponsiveLayouts {
  const breakpoints: Record<string, number> = { lg: 12, md: 10, sm: 6 };
  const result: Record<string, LayoutItem[]> = {};

  for (const [bp, cols] of Object.entries(breakpoints)) {
    const existing: readonly LayoutItem[] = layouts[bp] || [];
    const existingIds = new Set(existing.map((l: LayoutItem) => l.i));
    const newItems = instances
      .filter((inst) => !existingIds.has(inst.id))
      .map((inst, idx) => defaultLayoutForInstance(inst, existing.length + idx, cols));
    const kept = existing.filter((l: LayoutItem) => instances.some((inst) => inst.id === l.i));
    result[bp] = [...kept, ...newItems];
  }

  return result as ResponsiveLayouts;
}

// -- Add Widget Modal --

function AddWidgetModal({ onAdd, onClose, instances }: { onAdd: (type: string) => void; onClose: () => void; instances: WidgetInstance[] }) {
  const typeCounts: Record<string, number> = {};
  for (const inst of instances) {
    typeCounts[inst.type] = (typeCounts[inst.type] || 0) + 1;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Add Widget</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WIDGET_TYPES.map((type) => {
            const def = WIDGET_REGISTRY[type];
            const count = typeCounts[type] || 0;
            return (
              <button
                key={type}
                onClick={() => { onAdd(type); onClose(); }}
                className="text-left bg-gray-800/60 hover:bg-gray-700/60 rounded-xl p-3 transition-colors cursor-pointer"
              >
                <p className="text-sm font-medium text-white">{def.name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{def.description}</p>
                {count > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1">{count} instance{count > 1 ? 's' : ''} active</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -- Main Grid --

export function DashboardGrid() {
  const [instances, setInstances] = useState<WidgetInstance[]>(loadInstances);
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => {
    const stored = loadLayouts();
    return ensureLayoutsForInstances(stored, loadInstances());
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });

  // Persist on changes — use functional updates only, no cascading effects
  useEffect(() => {
    saveInstances(instances);
  }, [instances]);

  useEffect(() => {
    saveLayouts(layouts);
  }, [layouts]);

  const addWidget = useCallback((type: string) => {
    const id = createInstanceId(type);
    const newInst: WidgetInstance = { id, type };
    setInstances((prev) => [...prev, newInst]);
    setLayouts((prev) => ensureLayoutsForInstances(prev, [...instances, newInst]));
  }, [instances]);

  const removeWidget = useCallback((id: string) => {
    setInstances((prev) => prev.filter((inst) => inst.id !== id));
    setLayouts((prev) => {
      const next: Record<string, LayoutItem[]> = {};
      for (const [bp, bpItems] of Object.entries(prev)) {
        next[bp] = [...(bpItems || [])].filter((l: LayoutItem) => l.i !== id);
      }
      return next as ResponsiveLayouts;
    });
  }, []);

  function resetAll() {
    const defaults = getDefaultInstances();
    setInstances(defaults);
    localStorage.removeItem(LAYOUT_KEY);
    setLayouts(ensureLayoutsForInstances({}, defaults));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
        <span>Drag cards from empty space. Resize from the bottom-right corner.</span>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer font-medium"
          >
            + Add widget
          </button>
          <button onClick={resetAll} className="hover:text-gray-300 transition-colors cursor-pointer">
            Reset all
          </button>
        </div>
      </div>
      <div ref={containerRef}>
        {mounted && (
          <ResponsiveGridLayout
            width={width}
            layouts={layouts}
            breakpoints={{ lg: 1024, md: 768, sm: 0 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={56}
            margin={[24, 24]}
            containerPadding={[0, 0]}
            dragConfig={{
              enabled: true,
              bounded: false,
              cancel: 'button,input,select,textarea,a,.recharts-wrapper,.react-resizable-handle,.widget-remove-btn',
              threshold: 0,
            }}
            resizeConfig={{ enabled: true, handles: ['se'] }}
            onLayoutChange={(_: Layout, allLayouts: ResponsiveLayouts) => setLayouts(allLayouts)}
          >
            {instances.map((inst) => {
              const def = WIDGET_REGISTRY[inst.type];
              if (!def) return <div key={inst.id} />;
              return (
                <div key={inst.id} className="relative overflow-hidden cursor-grab active:cursor-grabbing group">
                  {createElement(def.component)}
                  <button
                    onClick={() => removeWidget(inst.id)}
                    className="widget-remove-btn absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-gray-800/80 text-gray-400 hover:text-red-400 hover:bg-gray-700 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove widget"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
      {showAddModal && (
        <AddWidgetModal
          instances={instances}
          onAdd={addWidget}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
