# MASTER PROMPT — PERSONAL LIFE MANAGEMENT PLATFORM

You are acting as a senior software architect, backend engineer, frontend engineer, database architect, security engineer, UI/UX designer, QA engineer, DevOps engineer, and code reviewer.

I want you to build a production-quality personal life-management application from scratch.

This application should feel like a polished modern personal operating system rather than a collection of CRUD screens.

The application must be:

- Clean
- Beautiful
- Fast
- Secure
- Responsive
- Multi-user capable
- Extensible
- Maintainable
- Production-quality
- Easy to deploy
- Easy to extend in the future

============================================================
0. ABSOLUTE DEVELOPMENT RULES
============================================================

These rules are mandatory.

### DO NOT USE GIT

Do NOT execute any Git commands.

Do NOT:

- git init
- git status
- git add
- git commit
- git push
- git pull
- git checkout
- git branch
- git merge
- git clone
- git reset
- git stash
- git log
- or any other Git command

Do not create commits.

Do not push anything to GitHub/GitLab/Bitbucket.

I will handle Git myself.

You should only modify the project files in the working environment.

============================================================
1. VERY IMPORTANT — DO NOT STOP AT IMPLEMENTATION
============================================================

Your job is NOT finished when the code has been written.

After implementation is complete, you must verify the application yourself.

You must behave like both:

1. Developer
2. QA engineer

You must run and verify:

- Backend startup
- Frontend startup
- Database connectivity
- Database migrations
- Authentication
- Registration
- Login
- Logout
- Authorization
- User data isolation
- CRUD operations
- Dashboard
- Habits
- Tasks
- Notes
- Health
- Workouts
- Learning
- Courses
- Goals
- Analytics
- Calendar
- Responsive UI
- Light mode
- Dark mode
- Loading states
- Error states
- Empty states
- API errors
- Form validation
- Mobile layouts
- Desktop layouts

Where browser automation/testing is available, use it.

Where automated browser testing is not available, perform the strongest verification possible using available tools.

Do not simply say "it should work."

Actually test it.

If you find problems:

1. Identify the problem.
2. Fix it.
3. Re-run the relevant tests.
4. Re-check the feature.

Continue until the implementation is stable.

At the very end, provide me with:

- What was implemented
- What was tested
- Which tests passed
- Any limitations
- Any known issues
- Deployment readiness status

If everything is working correctly, clearly tell me that the application has been verified successfully.

If something cannot be verified, explicitly tell me what could not be verified and why.

Do NOT hide failures.

============================================================
2. PRODUCT VISION
============================================================

Build a personal life-management platform where each user can manage their own life data.

The application should allow users to manage:

- Daily mandatory activities
- Habits
- Health
- Exercise
- Workouts
- Tasks
- Upcoming tasks
- Later/someday tasks
- Personal work
- Outside/personal work
- Notes
- Learning
- Courses
- Books
- Technologies
- Topics
- Learning sessions
- Learning progress
- Goals
- Daily statistics
- Weekly statistics
- Monthly statistics
- Streaks
- Productivity
- Personal progress

The system must support multiple users.

Each user must have completely isolated data.

User A must never be able to access:

- User B's tasks
- User B's notes
- User B's habits
- User B's health data
- User B's workouts
- User B's learning data
- User B's goals
- User B's analytics

Design the architecture for multi-user support from day one even if I initially use it personally.

============================================================
3. TECHNOLOGY STACK
============================================================

Backend:

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy 2.x
- Alembic
- Pydantic v2
- pytest
- httpx

Frontend:

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS
- Recharts or equivalent charting library
- Framer Motion or equivalent animation library

Infrastructure:

- Docker
- Docker Compose
- PostgreSQL
- Backend container
- Frontend container

Deployment target:

- Render

The architecture must be suitable for production deployment on Render.

============================================================
4. BACKEND ARCHITECTURE
============================================================

The backend must have clean separation of concerns.

Separate:

- API routes
- schemas
- services
- repositories
- database models
- business logic
- authentication
- security
- configuration
- exceptions
- logging
- utilities

Use a clean and extensible structure.

Suggested structure:

backend/

    app/

        main.py

        core/
            config.py
            security.py
            logging.py
            exceptions.py

        api/
            dependencies.py
            router.py

            v1/
                routes/
                    auth.py
                    users.py
                    dashboard.py
                    habits.py
                    tasks.py
                    notes.py
                    health.py
                    workouts.py
                    learning.py
                    courses.py
                    goals.py
                    analytics.py
                    calendar.py

        models/
            user.py
            habit.py
            habit_log.py
            task.py
            note.py
            health_metric.py
            workout.py
            workout_session.py
            exercise.py
            course.py
            course_module.py
            course_lesson.py
            learning_item.py
            learning_session.py
            goal.py

        schemas/
            auth.py
            user.py
            habit.py
            task.py
            note.py
            health.py
            workout.py
            learning.py
            course.py
            goal.py
            analytics.py
            dashboard.py

        repositories/
            base.py
            user_repository.py
            habit_repository.py
            task_repository.py
            note_repository.py
            health_repository.py
            workout_repository.py
            learning_repository.py
            goal_repository.py

        services/
            auth_service.py
            habit_service.py
            task_service.py
            note_service.py
            health_service.py
            workout_service.py
            learning_service.py
            goal_service.py
            analytics_service.py
            dashboard_service.py

        db/
            session.py
            base.py

        utils/
            datetime.py
            pagination.py
            enums.py

    migrations/

    tests/
        unit/
        integration/
        api/

    Dockerfile
    pyproject.toml
    requirements.txt

Do not blindly follow this exact structure.

If a better industry-standard architecture is appropriate, use it.

However, preserve the core separation between:

Route
    ↓
Service
    ↓
Repository
    ↓
Database

Routes must NOT contain business logic.

Repositories must NOT contain UI logic.

Services must NOT depend on HTTP-specific behavior unnecessarily.

============================================================
5. CLEAN CODE REQUIREMENTS
============================================================

Follow:

- SOLID
- DRY
- KISS
- separation of concerns
- single responsibility
- dependency injection
- type safety
- explicit interfaces where useful
- testability
- maintainability

Avoid:

- giant functions
- giant classes
- giant route files
- business logic in routes
- duplicated code
- magic strings
- magic numbers
- unnecessary abstractions
- unnecessary design patterns
- premature microservices
- tightly coupled modules

Prefer simple, readable production-quality code.

Use meaningful names.

Use type hints.

Use small focused functions.

Add comments/docstrings only where they provide real value.

Do not comment obvious code.

============================================================
6. MULTI-USER ARCHITECTURE
============================================================

This is extremely important.

The system must support multiple users.

Create a proper User model.

All user-owned entities must have ownership.

Example:

users
    ↓
habits
tasks
notes
health_metrics
workouts
learning_items
courses
goals

Use:

user_id

on user-owned tables.

Never trust user_id received from the client.

The current authenticated user must determine ownership.

For example:

BAD:

GET /tasks?user_id=123

GOOD:

Authenticated user
        ↓
current_user.id
        ↓
repository query
        ↓
WHERE user_id = current_user.id

Every service/repository query must enforce user ownership.

Test this explicitly.

Create tests such as:

User A creates task A.

User B attempts to access task A.

Expected:

403 or 404 according to the chosen security strategy.

Never leak information about another user's data.

============================================================
7. DATABASE
============================================================

Use PostgreSQL.

Use normalized relational database design.

Suggested entities:

users

habits

habit_logs

tasks

notes

health_metrics

exercises

workouts

workout_sessions

workout_sets

learning_items

courses

course_modules

course_lessons

learning_sessions

goals

goal_milestones

Use:

- UUID primary keys where appropriate
- foreign keys
- indexes
- unique constraints
- timestamps
- created_at
- updated_at
- appropriate soft deletion
- database-level constraints

Do NOT store the entire application in JSONB.

Use JSONB only when data is genuinely flexible.

Create proper Alembic migrations.

============================================================
8. AUTHENTICATION
============================================================

Implement secure authentication.

Support:

- registration
- login
- logout
- password hashing
- access token
- refresh token
- session management
- password validation
- account protection

Use Argon2id or another strong modern password hashing algorithm.

Never store plain-text passwords.

Never expose credentials.

Never hardcode secrets.

Use environment variables.

Provide:

.env.example

Never commit:

.env

============================================================
9. SECURITY
============================================================

Security is a first-class requirement.

Implement appropriate protection against:

- SQL injection
- XSS
- CSRF where applicable
- IDOR
- insecure CORS
- broken authorization
- credential exposure
- token leakage
- unsafe input
- excessive requests
- sensitive logging

Use:

- HTTPS in production
- secure cookies/tokens according to authentication strategy
- CORS restrictions
- security headers
- rate limiting where appropriate
- validation
- authorization
- ownership checks

Never expose stack traces in production.

Never log:

- passwords
- tokens
- secrets
- private note contents
- sensitive personal information

============================================================
10. API DESIGN
============================================================

Use REST APIs.

Example:

GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/{task_id}
PATCH  /api/v1/tasks/{task_id}
DELETE /api/v1/tasks/{task_id}

Modules:

/api/v1/auth
/api/v1/users
/api/v1/dashboard
/api/v1/tasks
/api/v1/habits
/api/v1/notes
/api/v1/health
/api/v1/workouts
/api/v1/learning
/api/v1/courses
/api/v1/goals
/api/v1/analytics
/api/v1/calendar

Use:

- proper HTTP methods
- correct status codes
- pagination
- filtering
- sorting
- validation
- consistent response format
- consistent error format

============================================================
11. FRONTEND ARCHITECTURE
============================================================

Use React + TypeScript.

Suggested:

src/

    app/
        router/
        providers/

    components/
        ui/
        common/
        charts/

    features/
        auth/
        dashboard/
        tasks/
        habits/
        notes/
        health/
        workouts/
        learning/
        courses/
        goals/
        analytics/
        calendar/
        profile/

    hooks/

    services/
        api/

    types/

    utils/

    layouts/

    pages/

Keep feature-specific logic together.

Use reusable UI components.

Use TanStack Query for server state.

Separate:

- server state
- UI state
- form state

Do not put API calls directly into every component.

Create a centralized API layer.

============================================================
12. UI/UX — VERY IMPORTANT
============================================================

The UI should be clean, modern, premium, and visually beautiful.

Do NOT make it look like an old enterprise admin dashboard.

Follow professional UX principles.

Use:

- visual hierarchy
- whitespace
- consistent spacing
- clear typography
- meaningful colors
- accessible contrast
- intuitive navigation
- predictable interactions
- clear feedback
- progressive disclosure
- good empty states
- clear calls to action

The interface should feel calm and focused rather than crowded.

Do not turn every piece of information into a card.

Use cards only where they improve comprehension.

============================================================
13. APPLICATION LAYOUT
============================================================

Create a proper application shell.

Desktop:

Top navigation/header

Left navigation/sidebar where appropriate

Main content

Right-side contextual content where useful

Mobile:

Mobile header

Bottom navigation or suitable mobile navigation

Main content

Floating quick action where appropriate

Navigation should be consistent across the application.

============================================================
14. HERO SECTIONS
============================================================

Important pages should have visually strong hero/header sections.

For example:

Dashboard:

"Good morning, Praveen"

"Here's your progress for today."

Learning:

"Keep learning."

"You're 72% through your current learning goals."

Health:

"Your health overview."

Goals:

"Move closer to your goals."

The hero area should contain useful information, not decorative text only.

Hero sections should adapt to the current user.

============================================================
15. PROFILE
============================================================

Create a proper Profile page.

Include:

- profile picture/avatar
- name
- email
- timezone
- preferences
- theme
- notification settings
- account settings
- security settings
- password change
- logout/session management

Design this so multiple users can each have their own profile.

============================================================
16. LIGHT AND DARK MODE
============================================================

Support:

Light mode

Dark mode

System preference

Persist user preference.

Create a proper design token system.

Do not create two completely unrelated designs.

Both themes should look intentionally designed.

Check contrast in both modes.

Charts must also work correctly in both themes.

============================================================
17. RESPONSIVE DESIGN
============================================================

Mandatory support:

360px

390px

430px

768px

1024px

1440px

1920px

The application must work correctly on:

- mobile
- tablet
- laptop
- desktop
- large monitors

Do not simply scale the desktop layout down.

Design appropriate mobile layouts.

No:

- horizontal overflow
- clipped content
- broken charts
- unreadable tables
- tiny buttons
- inaccessible menus

Touch targets must be appropriate.

============================================================
18. DASHBOARD
============================================================

The dashboard should answer within approximately 5 seconds:

1. What do I need to do today?
2. How am I doing?
3. Which habits are complete?
4. Which tasks remain?
5. Did I exercise?
6. How is health tracking?
7. What am I learning?
8. How much progress did I make?
9. What is coming next?
10. What should I focus on?

Dashboard sections:

Hero

Today's progress

Daily habits

Today's tasks

Upcoming tasks

Health summary

Workout summary

Learning progress

Goals

Current streak

Weekly overview

Quick actions

Recent notes

============================================================
19. DAILY HABITS
============================================================

Allow recurring habits.

Examples:

Exercise

Drink water

Read

Meditation

Study

Sleep

Each habit:

- name
- description
- frequency
- start date
- end date
- target
- reminder
- category
- icon
- color
- active/inactive

Status:

Completed

Skipped

Missed

Track:

Current streak

Longest streak

Daily completion

Weekly completion

Monthly completion

Display visual calendar/heatmap where appropriate.

============================================================
20. TASK MANAGEMENT
============================================================

Task categories:

Today

Upcoming

Later

Completed

Cancelled

Fields:

- title
- description
- priority
- due date
- due time
- category
- tags
- recurring
- estimated duration
- status

Support:

quick add

edit

delete

complete

reschedule

filters

sorting

overdue indicators

recurring tasks

Do not overcomplicate the task system.

============================================================
21. NOTES
============================================================

Notes must support:

- title
- content
- tags
- category
- pinned
- archive
- timestamps
- search

Provide pleasant reading and editing experiences.

Consider markdown support.

Autosave should be considered where appropriate.

============================================================
22. HEALTH
============================================================

Allow users to manually track:

- weight
- water
- sleep
- steps
- resting heart rate
- other configurable metrics
- exercise

Show:

daily

weekly

monthly

trends

Do not diagnose medical conditions.

Do not infer medical conclusions from entered data.

============================================================
23. WORKOUTS
============================================================

Support:

Exercises

Workout plans

Workout sessions

Sets

Repetitions

Weight

Duration

History

Personal records

Weekly frequency

Monthly frequency

Progress charts

Example:

Bench Press

3 × 10 × 50kg

Incline Dumbbell Press

3 × 12 × 18kg

============================================================
24. LEARNING SYSTEM
============================================================

Learning is a major feature.

Support:

- learning goals
- courses
- books
- technologies
- topics
- projects
- learning sessions

Hierarchy:

Learning Goal

    Course

        Module

            Lesson

                Completion

Example:

Python

Fundamentals        100%
OOP                 100%
Memory Management    70%
Async                30%
Advanced Python      10%

============================================================
25. COURSE PROGRESS
============================================================

Course dashboard:

Course title

Progress percentage

Progress bar

Lessons completed

Lessons remaining

Time invested

Last studied

Current lesson

Next lesson

Start date

Target date

Example:

Python Advanced

██████████████░░░░░░ 72%

62 / 86 lessons

31h 40m invested

Next:

Garbage Collection

Then:

Async Programming

============================================================
26. LEARNING SESSIONS
============================================================

Track:

Date

Duration

Topic

Course

Notes

Example:

September 26

Python

45 minutes

Garbage Collection

Notes...

Analytics:

Today

This week

This month

By technology

By topic

============================================================
27. GOALS
============================================================

Goals support:

- title
- description
- category
- target date
- progress
- status
- milestones

Show visual progress.

Examples:

Become advanced in Python

Complete RAG project

Exercise 4 times per week

Read two books

============================================================
28. ANALYTICS
============================================================

Provide:

Daily

Weekly

Monthly

Yearly where appropriate

Metrics:

Habit completion

Task completion

Exercise frequency

Learning hours

Learning consistency

Goal progress

Use charts only when they communicate useful information.

============================================================
29. PROGRESS
============================================================

Support:

Daily progress

Weekly progress

Monthly progress

Yearly progress

Example:

Today

████████████████░░░░ 82%

Weekly:

76%

Monthly:

84%

Clearly distinguish:

Completed

Partially completed

Missed

Skipped

Not applicable

Do not treat skipped and failed as identical.

============================================================
30. CALENDAR
============================================================

Calendar should display:

Tasks

Habits

Workouts

Learning sessions

Goal deadlines

Support:

Day

Week

Month

Navigation

============================================================
31. SEARCH
============================================================

Create global search architecture.

Search:

Tasks

Notes

Learning

Courses

Goals

Workouts

Eventually support PostgreSQL full-text search.

Use debouncing on frontend.

============================================================
32. NOTIFICATIONS
============================================================

Design an extensible notification system.

Future channels:

Browser

Email

Push

Notifications for:

Tasks

Habits

Learning

Workouts

Do not hardcode notification logic inside individual modules.

============================================================
33. ANIMATIONS
============================================================

Use Framer Motion or equivalent.

Use subtle animations for:

- page transitions
- progress bars
- completing habits
- completing tasks
- modals
- charts
- hover states
- skeleton loading
- success feedback

Animations must not become distracting.

Respect:

prefers-reduced-motion.

============================================================
34. LOADING / ERROR / EMPTY STATES
============================================================

Every major screen needs:

Loading

Error

Empty

Success

states.

Examples:

"No tasks today 🎉"

"You haven't started any learning sessions yet."

"Unable to load your habits. Try again."

Use skeleton loaders where appropriate.

============================================================
35. ACCESSIBILITY
============================================================

Follow accessibility best practices.

Support:

- keyboard navigation
- semantic HTML
- labels
- focus states
- screen readers
- accessible contrast
- reduced motion
- touch-friendly interactions

============================================================
36. PERFORMANCE
============================================================

Optimize:

- API calls
- database queries
- frontend rendering
- charts
- large lists
- search
- dashboard aggregation

Use:

- pagination
- caching
- query invalidation
- debouncing
- lazy loading
- optimistic updates where appropriate
- database indexes

Do not fetch huge datasets unnecessarily.

Do not calculate large dashboard statistics entirely in the browser.

============================================================
37. ERROR HANDLING
============================================================

Use centralized backend exception handling.

Consistent format:

{
    "error": {
        "code": "TASK_NOT_FOUND",
        "message": "Task not found"
    }
}

Do not expose internal implementation details.

Frontend should show useful user-friendly messages.

============================================================
38. LOGGING
============================================================

Implement structured logging.

Log:

- requests
- errors
- important application events
- authentication events where appropriate

Never log:

passwords

tokens

secrets

private note content

sensitive personal information

============================================================
39. TESTING
============================================================

Testing is mandatory.

Backend:

- unit tests
- service tests
- API tests
- integration tests
- authentication tests
- authorization tests
- ownership tests

Frontend:

- component tests
- important interaction tests
- critical user-flow tests

Test:

- registration
- login
- logout
- unauthorized access
- cross-user access
- CRUD
- validation
- edge cases
- empty data
- API failures

============================================================
40. CODE QUALITY
============================================================

Python:

- Ruff
- pytest
- type hints
- mypy where appropriate

Frontend:

- TypeScript strict mode
- ESLint
- Prettier

Do not suppress warnings/errors without understanding and documenting why.

============================================================
41. DOCKER
============================================================

Create:

docker-compose.yml

Services:

frontend

backend

postgres

Use:

- health checks
- environment variables
- proper networking
- persistent PostgreSQL volume

Do not put secrets inside Docker images.

============================================================
42. RENDER DEPLOYMENT
============================================================

The final application must be deployable to Render.

Prepare the project for:

Backend deployment

Frontend deployment

PostgreSQL deployment

Environment variables

CORS configuration

Production configuration

Database migrations

Health checks

Build commands

Start commands

The backend must expose an appropriate health endpoint.

Example:

GET /health

============================================================
43. README — MANDATORY
============================================================

Create a detailed README.md.

The README must contain a complete deployment manual.

It should explain step-by-step:

1. Project overview
2. Architecture
3. Technology stack
4. Local prerequisites
5. Clone/setup instructions
6. Environment variables
7. Local PostgreSQL setup
8. Docker setup
9. Backend setup
10. Frontend setup
11. Database migrations
12. Running the application locally
13. Running tests
14. Linting
15. Type checking
16. Production configuration
17. Render account setup
18. Creating PostgreSQL on Render
19. Deploying backend on Render
20. Deploying frontend on Render
21. Environment variables required on Render
22. CORS configuration
23. Database migration commands on Render
24. Health check configuration
25. Build commands
26. Start commands
27. Custom domain configuration
28. HTTPS
29. Troubleshooting
30. Updating the application
31. Database backup considerations
32. Security considerations

The deployment instructions must be written for a developer who has never deployed this exact application before.

Do not assume undocumented knowledge.

Use clear numbered steps.

Include the exact commands required.

The README must be updated whenever the deployment architecture changes.

============================================================
44. DOCUMENTATION
============================================================

Also create:

ARCHITECTURE.md

Include:

- system architecture
- backend layers
- frontend architecture
- database relationships
- authentication
- authorization
- security
- data ownership
- deployment architecture
- future extension points

============================================================
45. FUTURE AI ASSISTANT
============================================================

Do NOT implement AI initially.

But design the system so it can be added later.

Future commands:

"What should I do today?"

"What did I learn this week?"

"Show my unfinished tasks."

"Move my workout to tomorrow."

"Summarize my learning this month."

"How consistent was I this month?"

AI must NOT have unrestricted database access.

Instead expose controlled application services/tools:

get_tasks()

create_task()

update_task()

get_habits()

get_learning_progress()

get_health_summary()

get_notes()

create_learning_session()

etc.

============================================================
46. PRIVACY
============================================================

Follow privacy-by-design.

Allow:

- data export
- account deletion
- user data deletion

Do not collect unnecessary analytics.

Do not send personal information to third-party services unnecessarily.

Make external data sharing explicit.

============================================================
47. FUTURE EXTENSIBILITY
============================================================

The architecture should allow future modules:

Finance

Travel

Food

Reading

Projects

Journal

Inventory

Subscriptions

Documents

AI assistant

without rewriting unrelated modules.

============================================================
48. IMPLEMENTATION PHASES
============================================================

Do NOT attempt to build the entire application in one step.

Work incrementally.

PHASE 1

Analyze requirements.

Create:

- architecture
- database design
- API design
- frontend architecture
- security architecture
- UX architecture
- deployment architecture
- implementation roadmap

PHASE 2

Create project foundation:

- backend
- frontend
- database
- Docker
- configuration
- migrations
- health check

PHASE 3

Authentication and multi-user security.

PHASE 4

Tasks

Habits

Notes

Dashboard

PHASE 5

Health

Workouts

PHASE 6

Learning

Courses

Learning sessions

PHASE 7

Goals

Analytics

Calendar

PHASE 8

UX polish:

- responsive design
- hero sections
- navigation
- profile
- light mode
- dark mode
- animations
- accessibility
- loading states
- error states
- empty states

PHASE 9

Full testing.

PHASE 10

Security review.

PHASE 11

Performance review.

PHASE 12

Deployment preparation.

PHASE 13

Final end-to-end verification.

============================================================
49. DEVELOPMENT WORKFLOW
============================================================

Before modifying code:

1. Inspect the repository.
2. Understand existing files.
3. Understand dependencies.
4. Create a small implementation plan.
5. Implement one logical feature.
6. Run tests.
7. Run linting.
8. Run type checking.
9. Review security.
10. Review UX.
11. Continue.

Never blindly overwrite existing working code.

============================================================
50. FINAL END-TO-END VERIFICATION
============================================================

This is mandatory.

When all implementation is finished, stop adding features.

Perform a complete final verification.

Verify:

BACKEND

- starts successfully
- connects to PostgreSQL
- migrations work
- health endpoint works
- APIs work
- authentication works
- authorization works
- ownership isolation works
- validation works
- error handling works

FRONTEND

- builds successfully
- starts successfully
- connects to backend
- login works
- registration works
- dashboard works
- tasks work
- habits work
- notes work
- health works
- workouts work
- learning works
- courses work
- goals work
- analytics work
- calendar works
- profile works
- theme switching works
- responsive layout works

SECURITY

Test:

User A

versus

User B

Make sure no data leaks between users.

RESPONSIVENESS

Verify:

360px

390px

430px

768px

1024px

1440px

1920px

THEMES

Verify:

Light

Dark

System preference

UX

Verify:

Loading

Empty

Error

Success

Validation

Animations

Navigation

Forms

Accessibility

============================================================
51. FINAL REPORT
============================================================

After all verification is complete, provide a final report.

Include:

### Implementation Summary

What was built.

### Verification Summary

What was tested.

### Tests Passed

List the successful checks.

### Issues Found

List issues that were discovered and fixed.

### Remaining Issues

Only list actual remaining issues.

### Deployment Status

Tell me whether the application is ready for Render deployment.

### How to Run

Give the local commands.

### Render Deployment

Point me to the README deployment section.

IMPORTANT:

Do not tell me "everything works" unless you actually verified it.

If everything is verified successfully, clearly state:

"End-to-end verification completed successfully."

If something could not be verified, clearly identify it.

============================================================
52. FINAL QUALITY BAR
============================================================

The final result should feel like:

A professionally designed personal life-management platform.

NOT:

A collection of CRUD pages.

The backend must be clean and extensible.

The frontend must be beautiful and responsive.

The database must properly support multiple users.

Security must be treated as a first-class requirement.

The application must work on mobile, tablet, laptop, and desktop.

Progress must be visually clear.

Daily, weekly, and monthly tracking must be easy to understand.

The application should feel polished enough that a real person would want to use it every day.

============================================================
START
============================================================

First inspect the repository.

Do not start by writing the entire application.

First provide:

1. Architecture proposal
2. Folder structure
3. Database ERD/design
4. Backend module boundaries
5. API structure
6. Frontend architecture
7. Security architecture
8. Multi-user architecture
9. UI/UX structure
10. Responsive strategy
11. Deployment architecture
12. Render deployment strategy
13. Implementation phases
14. Estimated complexity of each phase

Then begin implementation incrementally.

Remember:

NO GIT COMMANDS.

Do not push anything.

Do not commit anything.

Do not stop at writing code.

Verify the application end-to-end before declaring it complete.