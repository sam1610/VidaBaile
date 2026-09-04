import React from 'react';

const mockActivities = [
  { day: 'Sun', time: '11am', activity: 'Salsa Gold', coach: 'Clara', room: 'A', color: 'salsa' },
  { day: 'Tue', time: '6pm', activity: 'Salsa Gold', coach: 'Clara', room: 'B', color: 'salsa' },
  { day: 'Wed', time: '7pm', activity: 'Bachata Adv', coach: 'Juan', room: 'B', color: 'bachata' },
  { day: 'Fri', time: '6pm', activity: 'Salsa Gold', coach: 'Clara', room: 'A', color: 'salsa' },
  { day: 'Fri', time: '7pm', activity: 'Salsa Gold', coach: 'Clara', room: 'A', color: 'salsa' },
  { day: 'Sat', time: '11am', activity: 'Merengue', coach: 'Maria', room: 'C', color: 'merengue' },
];

export const ActivitiesPanel: React.FC = () => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const times = ['10am', '11am', '12pm', '3pm', '5pm', '6pm', '7pm', '8pm', '9pm'];

  const activityMap: Record<string, Record<string, typeof mockActivities[0] | null>> = {};
  days.forEach((day) => {
    activityMap[day] = {};
    times.forEach((time) => {
      const activity = mockActivities.find((a) => a.day === day && a.time === time);
      activityMap[day][time] = activity || null;
    });
  });

  return (
    <div className="panel">
      <h3 className="panel-title">📅 ACTIVITIES & GROUP CLASSES</h3>
      <div className="panel-content">
        <div className="activity-grid">
          <div></div>
          {days.map((day) => (
            <div key={day} className="day-header">
              {day}
            </div>
          ))}
          {times.map((time) => (
            <React.Fragment key={time}>
              <div className="time-header">{time}</div>
              {days.map((day) => {
                const activity = activityMap[day][time];
                return (
                  <div key={`${day}-${time}`} className="time-slot">
                    {activity && (
                      <div
                        className={`activity-card ${activity.color}`}
                        title={`${activity.activity} with ${activity.coach} in Room ${activity.room}`}
                      >
                        <div>{activity.activity}</div>
                        <div style={{ fontSize: '9px', marginTop: '2px' }}>{activity.coach}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
