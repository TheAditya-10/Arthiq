// App entry. Registers the headless notification task alongside expo-router,
// so the native listener can run the pipeline even when the app has been
// swiped away (see src/notifications/headlessTask.ts).
import "expo-router/entry";
import { AppRegistry } from "react-native";
import { HEADLESS_TASK_NAME } from "./modules/notification-listener/index";
import { notificationHeadlessTask } from "./src/notifications/headlessTask";

AppRegistry.registerHeadlessTask(HEADLESS_TASK_NAME, () => notificationHeadlessTask);
