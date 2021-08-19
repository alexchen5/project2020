import React, { createContext, useCallback, useReducer } from "react";

import '../../Calendar.css'

import { getPlanIds, getUpdateRange, getWeeklyRanges} from './util';
import Plan from './Plan'
import ScrollHandler from "./ScrollHandler";
import Datenode from "./Datenode";
import DayHeaders from "./DayHeaders";
import CalendarContainer from "./CalendarContainer";
import { db } from "../../pages/HomePage";
import { UidContext } from "../../App";
import { Calendar, CalendarAction, CalendarContext } from "types/calendar";

export const calendarContext = createContext({} as CalendarContext);

const reducer = (state: Calendar, action: CalendarAction):Calendar => {
  switch (action.type) {
    case 'replace':
      return { ...state, dates: [...action.dates] };
    case 'load': 
      return action.dir === 'END' ? {
        ...state,
        dates: [...state.dates, ...action.dates],
      } : {
        ...state,
        dates: [...action.dates, ...state.dates],
      }
    case 'update':
      return {
        ...state,
        dates: state.dates.map(date => 
          action.plans[date.dateStr] ? { ...date, plans: action.plans[date.dateStr] } : date
        ),
      }
    case 'update-label':
      return {
        dates: state.dates.map(date =>
          action.labels[date.dateStr] ? { ...date, label: action.labels[date.dateStr] } : date
        )
      }
    default:
      const _exhaustiveCheck: never = action;
      return _exhaustiveCheck;
  }
}

function CalendarComponent() {
  const [calendar, dispatchCore] = useReducer(reducer, {dates: [], activeRange: [], planStyles: {}} as Calendar);
  // const [planStyles, setPlanStyles] = React.useState({} as PlanStyles);
  // const [range, setRange] = React.useState([]);
  const {uid} = React.useContext(UidContext);

  const dispatch = useCallback(async (action: CalendarAction) => {
    try {
      switch (action.type) {
        case 'add': {
          const ids = getPlanIds(dates, action.date_str);
          const prv = ids[ids.length - 1] || '';
          db.collection(`users/${uid}/plans`).add({
            date: action.date_str,
            content: action.entries,
            prv: prv,
          });
          break;
        }
        case 'edit': {
          db.doc(`users/${uid}/plans/${action.plan_id}`).update('content', action.entries);
          break;
        }
        case 'delete': {
          const ids = getPlanIds(dates, action.date_str);
          const p = ids.indexOf(action.plan_id);

          const delBatch = db.batch();
          if (ids[p+1]) delBatch.update(db.doc(`users/${uid}/plans/${ids[p+1]}`), 'prv', ids[p-1] || '');
          delBatch.delete(db.doc(`users/${uid}/plans/${action.plan_id}`));
          delBatch.commit();

          break;
        }
        case 'move': {
          const {plan_id, to_date, from_prv_id, from_nxt_id, to_prv_id, to_nxt_id } = action;
          
          const moveBatch = db.batch();
          if (to_nxt_id) moveBatch.update(db.doc(`users/${uid}/plans/${to_nxt_id}`), 'prv', plan_id);
          moveBatch.update(db.doc(`users/${uid}/plans/${plan_id}`), 'date', to_date, 'prv', to_prv_id);
          if (from_nxt_id) moveBatch.update(db.doc(`users/${uid}/plans/${from_nxt_id}`), 'prv', from_prv_id);
          moveBatch.commit();

          break;
        }
        case 'load': {
          dispatchCore({...action, dates: action.dateRange});
          db.collection(`users/${uid}/plan-style`) // user plan styling
            .onSnapshot((snapshot) => {
              const newStyles = {...planStyles};
              snapshot.forEach((doc) => {
                const d = doc.data();
                newStyles[doc.id] = {
                  label: d.label,
                  color: d.color,
                  colorDone: d.colorDone,
                }
                document.documentElement.style.setProperty(`--plan-color-${doc.id}`, d.color);
                document.documentElement.style.setProperty(`--plan-color-done-${doc.id}`, d.colorDone);
              });
              setPlanStyles(newStyles);
            })
          const ranges = getWeeklyRanges(action.start, action.end);
          ranges.forEach(r => {
            r.detachLabelsListener = db.collection(`users/${uid}/date-labels`) // labels for each date
              .where('date', '>=', r.start)
              .where('date', '<', r.end)
              .onSnapshot((snapshot) => {
                const newLabels = {};
                snapshot.forEach((doc) => {
                  const d = doc.data();
                  newLabels[d.date] = {
                    label_id: doc.id,
                    content: d.content,
                  };
                })
                dispatchCore({ type: 'update-label', labels: newLabels });

                // snapshot.docChanges().forEach(change => {
                //   console.log(change.doc.data(), change.type)
                // })
              });

            r.detachPlansListener = db.collection(`users/${uid}/plans`) // user's plans
              .where('date', '>=', action.start)
              .where('date', '<', action.end)
              .onSnapshot((snapshot) => {
                const newPlans = getUpdateRange(action.start, action.end);
                let reserves = [];
                snapshot.forEach((doc) => {
                  const d = doc.data();
                  const newPlan = {
                    plan_id: doc.id,
                    content: d.content,
                    styleId: d.planStyleId || "default",
                    prv: d.prv,
                  };
                  if (!d.prv) {
                    newPlans[d.date].push(newPlan);
                  } else {
                    const prv = newPlans[d.date].findIndex(plan => plan.plan_id === d.prv);
                    if (prv !== -1) newPlans[d.date].splice(prv + 1, 0, newPlan);
                    else reserves.push({date: d.date, plan: newPlan});
                  }
                });
                let prvlen;
                while (reserves.length && reserves.length !== prvlen) {
                  let nextReserves = [];
                  reserves.forEach(r => {
                    const prv = newPlans[r.date].findIndex(plan => plan.plan_id === r.plan.prv);
                    if (prv !== -1) newPlans[r.date].splice(prv + 1, 0, r.plan);
                    else nextReserves.push(r);
                  })
                  prvlen = reserves.length;
                  reserves = nextReserves;
                }
                reserves.forEach(r => {
                  r.plan.prv = '';
                  newPlans[r.date].push(r.plan);
                })
                dispatchCore({ type: 'update', plans: newPlans });

                // snapshot.docChanges().forEach(change => {
                //   console.log(change.doc.data(), change.type)
                // })
              });
          });
          if (action.dir === 'END') {
            setRange([...range, ...ranges]);
          } else {
            setRange([...ranges, ...range]);
          }
          break;
        }
        case 'replace':
          dispatchCore({...action});
          break;
        default: {
          console.warn(`Unknown action type: ${action.type}`);
        }
      }
    } catch (error) {
      console.log(action, error);
    }
  }, [uid, dates, range, planStyles]);
  // const clipboard = React.useRef();

  return (
    <calendarContext.Provider value={{ calendar, dispatch }}>
      <CalendarContainer>
        <DayHeaders />
        <ScrollHandler>
          {calendar.dates.map(date => <Datenode
            key={date.dateStr}
            dateStr={date.dateStr}
            label={date.label}
          >
            {date.plans.map(plan => <Plan
              key={plan.planId}
              plan={{dateStr: date.dateStr, ...plan}}
            />)}
          </Datenode>)}
        </ScrollHandler>
      </CalendarContainer>
    </calendarContext.Provider>
  );
}

export default CalendarComponent;
