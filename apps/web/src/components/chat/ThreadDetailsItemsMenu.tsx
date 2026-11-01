import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { useTranslation } from "react-i18next";
import { MenuCheckboxItem, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "../ui/menu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
  type ThreadDetailsItemId,
} from "./threadDetailsItems";

/** Menu body that shows and hides thread details items. The card's context menu and Settings share it. */
export function ThreadDetailsItemsMenuItems() {
  const { t } = useTranslation("chat");
  const labels: Record<ThreadDetailsItemId, string> = {
    environment: t(($) => $.details.environment),
    openIn: t(($) => $.details.openIn),
    scripts: t(($) => $.details.scripts),
    branch: t(($) => $.details.branch),
    gitActions: t(($) => $.details.gitActions),
    changes: t(($) => $.details.changes),
    servers: t(($) => $.details.servers),
    automations: t(($) => $.details.automations),
    lineage: t(($) => $.details.lineage),
    sideChats: t(($) => $.details.sideChats),
    usage: t(($) => $.details.usage),
    context: t(($) => $.details.contextWindow),
  };
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>{t(($) => $.details.show)}</MenuGroupLabel>
        {THREAD_DETAILS_ITEMS.map((item) => (
          <MenuCheckboxItem
            key={item.id}
            checked={visibility[item.id]}
            onCheckedChange={(checked) =>
              updateClientSettings({
                threadDetailsItems: setThreadDetailsItem(getClientSettings(), item, checked),
              })
            }
          >
            {labels[item.id]}
          </MenuCheckboxItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem
        disabled={isDefaultThreadDetailsVisibility(visibility)}
        onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
      >
        {t(($) => $.details.reset)}
      </MenuItem>
    </>
  );
}
