import os
import json
import datetime
from typing import Dict, List, Optional

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False
    print("WARNING: Google Client libraries not found. Calendar integration will be disabled.")

SCOPES = ['https://www.googleapis.com/auth/calendar']
SERVICE_ACCOUNT_FILE = 'credentials.json' # Expecting this file in root or apps/api

class CalendarService:
    def __init__(self):
        self.creds = None
        self.service = None
        
        if GOOGLE_LIBS_AVAILABLE:
            self._authenticate()

    def _authenticate(self):
        try:
            # Look for credentials in a few places
            paths = [
                SERVICE_ACCOUNT_FILE,
                os.path.join(os.getcwd(), SERVICE_ACCOUNT_FILE),
                os.path.join(os.path.dirname(__file__), '..', SERVICE_ACCOUNT_FILE),
            ]
            
            found_path = None
            for p in paths:
                if os.path.exists(p):
                    found_path = p
                    break
            
            if found_path:
                self.creds = service_account.Credentials.from_service_account_file(
                    found_path, scopes=SCOPES)
                self.service = build('calendar', 'v3', credentials=self.creds)
                print(f"Calendar Service Authenticated using {found_path}")
            else:
                print("Calendar Service: credentials.json not found. Integration disabled.")
        except Exception as e:
            print(f"Calendar Service Auth Error: {e}")

    def create_event(self, summary: str, description: str, start_time: str, end_time: str, attendee_email: str = None) -> Optional[str]:
        """
        Creates an event in the primary calendar.
        start_time and end_time must be ISO strings.
        Returns the HTML link to the event.
        """
        if not self.service:
            print("Calendar Service not initialized. Skipping event creation.")
            return None

        try:
            event = {
                'summary': summary,
                'description': description,
                'start': {
                    'dateTime': start_time,
                    'timeZone': 'America/Sao_Paulo',
                },
                'end': {
                    'dateTime': end_time,
                    'timeZone': 'America/Sao_Paulo',
                },
            }
            
            if attendee_email:
                event['attendees'] = [{'email': attendee_email}]

            event = self.service.events().insert(calendarId='primary', body=event).execute()
            print('Event created: %s' % (event.get('htmlLink')))
            return event.get('htmlLink')
            
        except Exception as e:
            print(f"Error creating calendar event: {e}")
            return None

    def get_available_slots(self, num_days: int = 5, slots_per_day: int = 2) -> List[Dict]:
        """
        Queries Google Calendar for available time slots in the next business days.
        Returns a list of available slots with date and time.
        
        Business hours: Mon-Fri, 9h-19h (Brasilia timezone).
        Each visit lasts 1 hour.
        """
        if not self.service:
            print("Calendar Service not initialized. Returning default slots.")
            return self._generate_default_slots(num_days)

        try:
            tz = datetime.timezone(datetime.timedelta(hours=-3))  # Brasilia UTC-3
            now = datetime.datetime.now(tz)
            
            # Search window: next 10 calendar days to find enough business days
            search_end = now + datetime.timedelta(days=14)
            
            # Get existing events in the search window
            events_result = self.service.events().list(
                calendarId='primary',
                timeMin=now.isoformat(),
                timeMax=search_end.isoformat(),
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            existing_events = events_result.get('items', [])
            
            # Build a set of busy hours
            busy_slots = set()
            for event in existing_events:
                start = event.get('start', {}).get('dateTime')
                if start:
                    try:
                        event_start = datetime.datetime.fromisoformat(start)
                        # Mark the hour as busy
                        busy_slots.add((event_start.date(), event_start.hour))
                    except Exception:
                        pass
            
            # Generate available slots
            available = []
            current_date = now.date()
            if now.hour >= 17:  # After 5pm, start from next day
                current_date += datetime.timedelta(days=1)
            
            days_found = 0
            while days_found < num_days and current_date <= search_end.date():
                # Skip weekends (5=Saturday, 6=Sunday)
                if current_date.weekday() >= 5:
                    current_date += datetime.timedelta(days=1)
                    continue
                
                day_slots = []
                # Business hours: 9h to 18h (last slot at 18h, ends at 19h)
                for hour in [9, 10, 11, 14, 15, 16, 17, 18]:
                    if current_date == now.date() and hour <= now.hour + 1:
                        continue  # Skip past hours + 1h buffer
                    
                    if (current_date, hour) not in busy_slots:
                        day_slots.append({
                            "date": current_date.strftime("%d/%m/%Y"),
                            "weekday": self._weekday_name(current_date.weekday()),
                            "time": f"{hour:02d}:00",
                            "datetime_iso": f"{current_date.isoformat()}T{hour:02d}:00:00-03:00"
                        })
                
                if day_slots:
                    # Pick spread-out slots (morning + afternoon)
                    morning = [s for s in day_slots if int(s["time"][:2]) < 12]
                    afternoon = [s for s in day_slots if int(s["time"][:2]) >= 14]
                    
                    picked = []
                    if morning:
                        picked.append(morning[len(morning)//2])  # Mid-morning
                    if afternoon:
                        picked.append(afternoon[len(afternoon)//2])  # Mid-afternoon
                    if not picked:
                        picked = day_slots[:slots_per_day]
                    
                    available.extend(picked[:slots_per_day])
                    days_found += 1
                
                current_date += datetime.timedelta(days=1)
            
            if available:
                print(f"[Calendar] Found {len(available)} available slots")
                return available[:num_days * slots_per_day]
            else:
                return self._generate_default_slots(num_days)
                
        except Exception as e:
            print(f"Error querying calendar availability: {e}")
            return self._generate_default_slots(num_days)

    def _generate_default_slots(self, num_days: int = 4) -> List[Dict]:
        """Fallback: generate default slots based on next business days."""
        tz = datetime.timezone(datetime.timedelta(hours=-3))
        now = datetime.datetime.now(tz)
        current_date = now.date() + datetime.timedelta(days=1)
        
        slots = []
        days_found = 0
        while days_found < num_days and days_found < 10:
            if current_date.weekday() < 5:  # Mon-Fri
                slots.append({
                    "date": current_date.strftime("%d/%m/%Y"),
                    "weekday": self._weekday_name(current_date.weekday()),
                    "time": "10:00",
                    "datetime_iso": f"{current_date.isoformat()}T10:00:00-03:00"
                })
                slots.append({
                    "date": current_date.strftime("%d/%m/%Y"),
                    "weekday": self._weekday_name(current_date.weekday()),
                    "time": "15:00",
                    "datetime_iso": f"{current_date.isoformat()}T15:00:00-03:00"
                })
                days_found += 1
            current_date += datetime.timedelta(days=1)
        
        return slots[:num_days * 2]

    @staticmethod
    def _weekday_name(weekday: int) -> str:
        names = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
        return names[weekday] if weekday < len(names) else ""
