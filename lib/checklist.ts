// F19 자녀용 준비 체크리스트(D-7 / D-1 / 당일 아침), F18 부모님 준비물.
// 일정과 입력값으로 코드가 만든다(같은 입력이면 같은 목록, API 비용 없음).
import type { ConcertView, ParentProfile, Prefs, TicketInfo, Transport } from "./types.ts";

export interface CheckItem { id: string; phase: "D-7" | "D-1" | "당일 아침"; text: string }

function season(date: string) {
  const m = Number(date.slice(5, 7));
  return m === 12 || m <= 2 ? "winter" : m >= 6 && m <= 8 ? "summer" : "mild";
}

export function buildChecklist(o: { concert: ConcertView; parent: ParentProfile; prefs: Prefs; transport: Transport; ticket: TicketInfo; who: string }): CheckItem[] {
  const { concert, parent, prefs, transport: t, ticket, who } = o;
  const out: CheckItem[] = [];
  const add = (phase: CheckItem["phase"], id: string, text: string) => out.push({ id, phase, text });

  add("D-7", "ticket_pickup", ticket.pickup === "onsite" ? `현장 수령이면 수령 장소·시간과 필요한 것(예매 번호·신분증)을 ${who}께 알려 드리기` : ticket.pickup === "mobile" ? `모바일 티켓을 ${who} 휴대폰으로 옮기거나 캡처해 드리기` : "티켓 수령 방식 확인하기(모바일 / 현장 수령 / 종이 티켓)");
  if (ticket.id_check) add("D-7", "id_check", `예매자 본인 확인이 있는지 확인하고, ${who} 신분증을 챙기시게 말씀드리기`);
  if (t.mode === "fan_bus") add("D-7", "bus_confirm", `팬 모임 버스 집결 시각·장소${t.meet_time ? `(${t.meet_time} ${t.meet_place})` : ""}와 귀가 출발 시각을 ${who}께 다시 알려 드리기`);
  if (t.mode === "train") add("D-7", "train_confirm", "열차 왕복 예매 확인하고, 승차권을 휴대폰에 넣어 드리기");
  if (t.mode === "shuttle") add("D-7", "shuttle_confirm", "공연 셔틀 예약·탑승 장소 공지 확인하기");
  if (t.stay === "overnight") add("D-7", "stay", "숙소 예약 확인하고 주소를 안내장에 함께 알려 드리기");
  if (!Object.keys(concert.gate_map ?? {}).length) add("D-7", "notice", "공연 공지(입장 게이트·MD 부스 시간)가 나왔는지 확인하기");

  add("D-1", "weather", "공연 날 날씨 확인하기");
  const s = season(concert.date);
  add("D-1", "clothes", s === "winter" ? "핫팩·목도리·따뜻한 겉옷 챙기시게 말씀드리기(줄 서는 곳이 추울 수 있어요)" : s === "summer" ? "양산·물·부채 챙기시게 말씀드리기" : "얇은 겉옷과 우비 챙기시게 말씀드리기");
  add("D-1", "kit", "응원봉·보조배터리·방석 챙기시게 말씀드리기");
  if (parent.medicine_time) add("D-1", "medicine", `드시는 약(${parent.medicine_time})을 챙기시게 말씀드리기`);
  if (prefs.goods) add("D-1", "goods", "굿즈 살 돈(카드·현금) 챙기시게 말씀드리기");
  add("D-1", "charge", `${who} 휴대폰 충전 부탁드리기`);

  add("당일 아침", "link", "안내장 링크를 다시 보내 드리고, 열어 보셨는지 확인하기");
  add("당일 아침", "call", t.mode === "fan_bus" ? "버스에 타셨는지 전화로 확인하기" : "출발하셨는지 전화로 확인하기");
  add("당일 아침", "status", "진행 상황 링크를 내 휴대폰에 열어 두기");
  return out;
}

/** F18 부모님 준비물 (큰 글씨 표지에 보여 줄 것) */
export function parentKit(o: { concert: ConcertView; parent: ParentProfile; prefs: Prefs; ticket: TicketInfo }): string[] {
  const s = season(o.concert.date);
  return [
    o.ticket.pickup === "paper" ? "종이 티켓" : "티켓(휴대폰)",
    ...(o.ticket.id_check ? ["신분증"] : []),
    "휴대폰 · 보조배터리",
    "응원봉",
    s === "winter" ? "핫팩 · 목도리" : s === "summer" ? "물 · 양산" : "우비",
    ...(o.parent.medicine_time ? ["드시는 약"] : []),
    ...(o.prefs.goods ? ["굿즈 살 카드·현금"] : []),
  ];
}
