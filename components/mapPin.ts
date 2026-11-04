// 지도 핀: 빨간 핀 + 위에 흰 알약 이름표(그림자). 부모님 지도와 자녀 동선 지도에서 같이 쓴다
export const PIN_LABEL: Record<string, string> = {
  restaurant: "식당", cafe: "카페", rest: "쉼터", goods: "굿즈", photo: "포토존", toilet: "화장실", elevator: "엘리베이터",
  gate: "입구", bus_stop: "버스", info_desk: "안내소", locker: "보관함", sight: "명소",
};

export function pinElement(label: string, opts: { focus?: boolean; num?: number } = {}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:auto";
  const chip = document.createElement("div");
  chip.textContent = opts.num != null ? `${opts.num}  ${label}` : label;
  chip.style.cssText = `background:#fff;color:#23313B;border-radius:999px;padding:${opts.focus ? "7px 13px" : "5px 11px"};font:800 ${opts.focus ? 15 : 13}px "Noto Sans KR",sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.12);white-space:nowrap;margin-bottom:3px`;
  const pin = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pin.setAttribute("viewBox", "0 0 24 32");
  pin.setAttribute("width", opts.focus ? "30" : "24");
  pin.setAttribute("height", opts.focus ? "40" : "32");
  pin.innerHTML = '<path d="M12 31s10-11.2 10-18.5C22 6.2 17.5 2 12 2S2 6.2 2 12.5C2 19.8 12 31 12 31z" fill="#E5484D" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12.5" r="4" fill="#fff"/>';
  pin.style.filter = "drop-shadow(0 3px 4px rgba(0,0,0,.25))";
  wrap.append(chip, pin);
  return wrap;
}
