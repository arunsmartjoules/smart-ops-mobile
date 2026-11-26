/**
 * Pages by Project Type for the app-wide selected site: whether a module's
 * page is on there (services/ProjectTypePages). Pair it with the role's
 * `canView`; it only hides, never grants.
 *
 * With no site selected yet, or before the saved settings are known (cache or
 * server, `projectTypePagesReady`), every page is on, so nothing flickers away
 * or bounces on the defaults while the launch restores the real answer.
 */
import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type PermissionModule } from "@/contexts/PermissionsContext";
import { useSites } from "@/hooks/useSites";
import { isModuleOnFor, projectTypeOfSite } from "@/services/ProjectTypePages";

export function useSelectedPageOn(): (module: PermissionModule) => boolean {
  const { user } = useAuth();
  const { selectedSite } = useSites(user?.user_id || user?.id);
  const { projectTypePages, projectTypePagesReady } = usePermissions();
  const type = selectedSite && projectTypePagesReady ? projectTypeOfSite(selectedSite) : null;
  return useCallback(
    (module: PermissionModule) => isModuleOnFor(projectTypePages, type, module),
    [projectTypePages, type],
  );
}
