import { setLiveMapFlat, useMapFlat } from '../maps/liveMap'

/**
 * The map's 2D/3D switch, at its top right: 3D shows the driving view, tilted behind the truck (the map's own);
 * 2D shows it flat, from straight above, the truck low on it still (owner 2026-11-17: "切换为3D时是默认的显示
 * 方式 切换为2D时是平面的显示方式 把视角转为俯视"). The knob slides to the chosen one; the map's own camera
 * damping tilts it over, so nothing jumps and no extra frames are drawn.
 */
export function ViewSwitch() {
  const flat = useMapFlat((state) => state.flat)
  return (
    <div className="view-switch glass" role="group" aria-label="2D / 3D">
      <span className="view-thumb" data-flat={flat} aria-hidden="true" />
      <button type="button" data-on={!flat} aria-pressed={!flat} onClick={() => setLiveMapFlat(false)}>
        3D
      </button>
      <button type="button" data-on={flat} aria-pressed={flat} onClick={() => setLiveMapFlat(true)}>
        2D
      </button>
    </div>
  )
}
