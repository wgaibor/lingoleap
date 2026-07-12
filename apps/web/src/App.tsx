import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { CoursesPage } from './features/course-path/CoursesPage';
import { CoursePathPage } from './features/course-path/CoursePathPage';
import { LessonPlayerPage } from './features/lesson-player/LessonPlayerPage';

export default function App() {
  return (
    <>
      <h1>LingoLeap</h1>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <CoursesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/course/:language/:level"
          element={
            <RequireAuth>
              <CoursePathPage />
            </RequireAuth>
          }
        />
        <Route
          path="/lesson/:lessonId"
          element={
            <RequireAuth>
              <LessonPlayerPage />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}
