// DayOne100 Tools · Check-in timetable, school year 2026-2027
// One entry per group, with every session date and time. The teacher view uses this to show
// today's classes and to label each check-in with date, time, course and group, so it lines up
// with the session in Compass. Edit here when the timetable changes.
window.CHECKIN_SCHEDULE = {
  groups: [
    { code: 'TECH3',     course: 'Tech 3',             courseCode: '0205EE', group: 'Year 2',
      compass: 'TECH 3: Building with No-Code, from idea to digital prototype' },
    { code: 'TECH1-T1',  course: 'Tech 1',             courseCode: '0107EE', group: 'Team 1',
      compass: 'TECH 1: Digital Foundations' },
    { code: 'TECH1-T2',  course: 'Tech 1',             courseCode: '0107EE', group: 'Team 2',
      compass: 'TECH 1: Digital Foundations' },
    { code: 'DIGSKILLS', course: 'Digital Skills & AI', courseCode: '0209EE', group: 'Feb/Mar cohort',
      compass: 'Digital Skills & AI' }
  ],
  // [group code, date, start, end]
  slots: [
    ['TECH3', '2026-09-09', '09:00', '11:00'], ['TECH3', '2026-09-16', '09:00', '11:00'],
    ['TECH3', '2026-09-23', '09:00', '11:00'], ['TECH3', '2026-09-30', '09:00', '11:00'],
    ['TECH3', '2026-10-07', '09:00', '11:00'], ['TECH3', '2026-10-14', '09:00', '11:00'],
    ['TECH3', '2026-10-28', '09:00', '11:00'], ['TECH3', '2026-11-04', '09:00', '11:00'],
    ['TECH3', '2026-11-11', '09:00', '11:00'],

    ['TECH1-T1', '2026-10-28', '11:30', '13:30'], ['TECH1-T1', '2026-11-04', '11:30', '13:30'],
    ['TECH1-T1', '2026-11-11', '11:30', '13:30'], ['TECH1-T1', '2026-11-18', '11:30', '13:30'],
    ['TECH1-T1', '2026-11-25', '11:30', '13:30'], ['TECH1-T1', '2026-12-02', '11:30', '13:30'],

    ['TECH1-T2', '2026-10-28', '14:00', '16:00'], ['TECH1-T2', '2026-11-04', '14:00', '16:00'],
    ['TECH1-T2', '2026-11-11', '14:00', '16:00'], ['TECH1-T2', '2026-11-18', '09:00', '11:00'],
    ['TECH1-T2', '2026-11-25', '09:00', '11:00'], ['TECH1-T2', '2026-12-02', '09:00', '11:00'],

    ['DIGSKILLS', '2026-09-09', '11:30', '13:30'], ['DIGSKILLS', '2026-09-16', '11:30', '13:30'],
    ['DIGSKILLS', '2026-09-23', '11:30', '13:30'], ['DIGSKILLS', '2026-09-30', '11:30', '13:30'],
    ['DIGSKILLS', '2026-10-07', '11:30', '13:30'], ['DIGSKILLS', '2026-10-14', '11:30', '13:30']
  ]
};
