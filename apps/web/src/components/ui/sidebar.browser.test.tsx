import { useState } from "react";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { dismissContextMenu } from "~/contextMenuFallback";
import { ConfirmDialogHost } from "~/components/ConfirmDialogHost";
import { CommandDialog, CommandDialogPopup } from "~/components/ui/command";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { startWorkspaceFocus, workspaceAreaProps } from "~/lib/workspaceFocus";
import { createLocalApi, isContextMenuOpen } from "~/localApi";

import { act, render, type Screen } from "../../../test/render";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./sidebar";

function CollapseFromInside() {
  const { setOpen } = useSidebar();
  return (
    <button type="button" onClick={() => setOpen(false)}>
      Collapse
    </button>
  );
}

function AddProject() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add project
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup aria-label="Projects">Projects</CommandDialogPopup>
      </CommandDialog>
    </>
  );
}

function Harness(props: { readonly onResize?: (width: number) => void }) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        collapsible="offcanvas"
        holdPeek={isContextMenuOpen}
        resizable={{
          minWidth: 200,
          maxWidth: 600,
          ...(props.onResize ? { onResize: props.onResize } : {}),
        }}
      >
        <div className="drag-region h-6">Sidebar header</div>
        <CollapseFromInside />
        <input aria-label="Title" />
        <Popover>
          <PopoverTrigger render={<button type="button" />}>Filter</PopoverTrigger>
          <PopoverPopup className="w-96">Filter options</PopoverPopup>
        </Popover>
        <AddProject />
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger />
      <main>
        <header className="drag-region h-10">Titlebar</header>
        <div {...workspaceAreaProps("composer", 2, "Message input")}>
          <div aria-label="Composer" contentEditable role="textbox" />
        </div>
      </main>
      <iframe className="ml-auto h-40 w-80" sandbox="" title="Preview" />
      <ConfirmDialogHost />
    </SidebarProvider>
  );
}

async function collapse(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
  const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
  await vi.waitFor(() => expect(sidebar.inert).toBe(true));
  return sidebar;
}

async function peek(screen: Screen, sidebar: HTMLElement) {
  await userEvent.hover(screen.container.querySelector<HTMLElement>('[data-slot="sidebar-edge"]')!);
  await vi.waitFor(() => expect(sidebar.inert).toBe(false));
}

// act flushes the render a closing pointer event schedules, so a kept peek is checked synchronously.
function pointer(type: string, init: PointerEventInit) {
  return act(() =>
    document.body.dispatchEvent(new PointerEvent(type, { bubbles: true, clientY: 400, ...init })),
  );
}

function move(clientX: number) {
  return pointer("pointermove", { clientX });
}

function out(relatedTarget: EventTarget | null, clientX = 0) {
  return pointer("pointerout", { relatedTarget, clientX });
}

describe("Sidebar", () => {
  it("hands focus to the outside trigger when it collapses around the focused control", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });

    await collapse(screen);
    const trigger = screen.container.querySelector('[data-slot="sidebar-trigger"]');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows a collapsed sidebar over the content from the screen edge until the pointer leaves", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />);
    using _workspaceFocus = { [Symbol.dispose]: startWorkspaceFocus(screen.router!) };
    const sidebar = await collapse(screen);
    await peek(screen, sidebar);
    const container = sidebar.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!;
    await vi.waitFor(() => expect(container.getBoundingClientRect().left).toBe(0));
    const titlebar = screen.getByText("Titlebar").element();
    expect(getComputedStyle(titlebar).getPropertyValue("-webkit-app-region")).toBe("no-drag");
    expect(
      getComputedStyle(screen.getByText("Sidebar header").element()).getPropertyValue(
        "-webkit-app-region",
      ),
    ).toBe("no-drag");
    expect(sidebar.querySelector('[data-slot="sidebar-gap"]')!.getBoundingClientRect().width).toBe(
      0,
    );

    const rail = sidebar.querySelector('[data-slot="sidebar-rail"]')!.getBoundingClientRect();
    await move(rail.right - 1);
    expect(sidebar.inert).toBe(false);
    container.style.width = `${container.offsetWidth + 100}px`;
    await move(rail.right + 1);
    expect(sidebar.inert).toBe(false);
    container.style.width = "";
    (screen.getByRole("button", { name: "Filter" }).element() as HTMLElement).focus();
    await move(rail.right + 1);
    expect(sidebar.inert).toBe(true);
    expect(getComputedStyle(titlebar).getPropertyValue("-webkit-app-region")).toBe("drag");
    // The composer, not the trigger button, so typing still reaches it.
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Composer" }).element(),
    );

    await peek(screen, sidebar);
    await act(() =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }),
      ),
    );
    expect(sidebar.inert).toBe(false);
    // A held button means a drag inside the peek owns Escape.
    await pointer("pointermove", { clientX: 10, buttons: 1 });
    await act(() =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(sidebar.inert).toBe(false);
    await pointer("pointerup", { clientX: 10 });
    const input = screen.getByRole("textbox", { name: "Title" }).element() as HTMLElement;
    input.focus();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(() => input.dispatchEvent(escape));
    expect(sidebar.inert).toBe(true);
    expect(escape.defaultPrevented).toBe(true);

    await peek(screen, sidebar);
    // The trigger sits under the overlay, so it is clicked directly.
    screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!.click();
    await vi.waitFor(() => expect(sidebar.dataset.state).toBe("expanded"));
    await collapse(screen);
    expect(sidebar.dataset.peek).toBe("false");
  });

  it("keeps the peek open while editing inside it or while a popup, dialog or context menu is open", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });
    const sidebar = await collapse(screen);
    await peek(screen, sidebar);

    const input = screen.getByRole("textbox", { name: "Title" });
    const field = input.element() as HTMLElement;
    const filter = screen.getByRole("button", { name: "Filter" }).element() as HTMLElement;
    await userEvent.click(input);
    await move(1000);
    expect(document.activeElement).toBe(field);
    expect(sidebar.inert).toBe(false);
    await act(() => filter.focus());
    expect(sidebar.inert).toBe(false);
    await act(() => filter.blur());
    expect(sidebar.inert).toBe(true);

    await peek(screen, sidebar);

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await expect.element(page.getByText("Filter options")).toBeVisible();
    await move(1000);
    expect(sidebar.inert).toBe(false);
    await move(10);
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByText("Filter options")).not.toBeInTheDocument();
    expect(sidebar.inert).toBe(false);

    filter.focus();
    using _menu = { [Symbol.dispose]: () => dismissContextMenu(false) };
    const shown = createLocalApi().contextMenu.show([{ id: "rename", label: "Rename" }], {
      x: 600,
      y: 600,
    });
    await move(1000);
    await out(null);
    expect(sidebar.inert).toBe(false);

    dismissContextMenu();
    await shown;
    // Rename mounts an autofocused input while focus is back on the menu's trigger.
    await act(() => field.focus());
    expect(sidebar.inert).toBe(false);
    expect(document.activeElement).toBe(field);
    await act(() => field.blur());
    expect(sidebar.inert).toBe(true);

    await peek(screen, sidebar);
    const confirmed = createLocalApi().dialogs.confirm("Archive this thread?");
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    await move(1000);
    expect(sidebar.dataset.peek).toBe("true");
    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    await expect(confirmed).resolves.toBe(false);
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));

    await peek(screen, sidebar);
    await userEvent.click(screen.getByRole("button", { name: "Add project" }));
    await expect.element(page.getByRole("dialog", { name: "Projects" })).toBeVisible();
    await move(1000);
    expect(sidebar.dataset.peek).toBe("true");
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
  });

  it("ends the peek when the pointer moves onto a frame, out of the document, or touches down beside it", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });
    const sidebar = await collapse(screen);
    await peek(screen, sidebar);

    await userEvent.hover(screen.getByTitle("Preview"));

    await vi.waitFor(() => expect(sidebar.inert).toBe(true));

    await peek(screen, sidebar);
    await out(sidebar);
    expect(sidebar.inert).toBe(false);
    // Electron reports entering a drag region inside the sidebar as leaving the document.
    await out(null, 100);
    expect(sidebar.inert).toBe(false);
    await out(null);
    expect(sidebar.inert).toBe(true);

    await peek(screen, sidebar);
    const rail = sidebar.querySelector<HTMLElement>('[data-slot="sidebar-rail"]')!;
    await userEvent.hover(rail);
    await vi.waitFor(() => expect(rail.hasAttribute("data-popup-open")).toBe(true));
    await move(1000);
    expect(sidebar.inert).toBe(true);

    await peek(screen, sidebar);
    await pointer("pointerdown", { pointerType: "touch", buttons: 1, clientX: 1000 });
    expect(sidebar.inert).toBe(true);
  });

  it("abandons a rail drag when the sidebar collapses mid-drag", async () => {
    await page.viewport(1280, 800);
    const onResize = vi.fn();
    await using screen = await render(<Harness onResize={onResize} />, {
      router: false /* no routes involved */,
    });
    const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    const dragTo = (clientX: number) => {
      rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
      rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX }));
    };
    // A completed drag commits, so the abandoned one below is a real drag too.
    dragTo(left + 40);
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 40 }));
    expect(onResize).toHaveBeenCalledTimes(1);

    dragTo(left + 80);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!,
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 80 }));

    expect(onResize).toHaveBeenCalledTimes(1);
  });
});

it("restores collapsed and expanded desktop state after remounting", async () => {
  await page.viewport(1280, 800);
  const storageKey = "sidebar_persistence_test";
  localStorage.removeItem(storageKey);
  const layout = () => (
    <SidebarProvider storageKey={storageKey}>
      <SidebarTrigger />
    </SidebarProvider>
  );
  {
    await using screen = await render(layout(), { router: false /* no routes involved */ });
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    await expect.element(trigger).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(trigger);
    await expect.element(trigger).toHaveAttribute("aria-pressed", "false");
  }
  {
    await using screen = await render(layout(), { router: false /* no routes involved */ });
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    await expect.element(trigger).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(trigger);
  }
  await using screen = await render(layout(), { router: false /* no routes involved */ });
  await expect
    .element(screen.getByRole("button", { name: "Toggle Sidebar" }))
    .toHaveAttribute("aria-pressed", "true");
  localStorage.removeItem(storageKey);
});

it("keeps the mobile sheet closed and leaves the saved desktop state alone", async () => {
  await page.viewport(390, 844);
  const storageKey = "sidebar_mobile_persistence_test";
  localStorage.setItem(storageKey, "false");
  {
    await using screen = await render(
      <SidebarProvider storageKey={storageKey}>
        <SidebarTrigger />
      </SidebarProvider>,
      { router: false /* no routes involved */ },
    );
    const trigger = screen.getByRole("button", { name: "Toggle Sidebar" });
    await expect.element(trigger).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(trigger);
    await expect.element(trigger).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(storageKey)).toBe("false");
  }
  await using screen = await render(
    <SidebarProvider storageKey={storageKey}>
      <SidebarTrigger />
    </SidebarProvider>,
    { router: false /* no routes involved */ },
  );
  await expect
    .element(screen.getByRole("button", { name: "Toggle Sidebar" }))
    .toHaveAttribute("aria-pressed", "false");
  localStorage.removeItem(storageKey);
});

function MobileSheetMountedProbe() {
  const { mobileSheetMounted } = useSidebar();
  return <output aria-label="Sheet mounted">{String(mobileSheetMounted)}</output>;
}

it("keeps closed mobile sheet contents mounted and reports the sheet only while it shows", async () => {
  await page.viewport(390, 844);
  await using screen = await render(
    <SidebarProvider>
      <Sidebar>
        <span>Sheet contents</span>
      </Sidebar>
      <SidebarTrigger />
      <MobileSheetMountedProbe />
    </SidebarProvider>,
    { router: false /* no routes involved */ },
  );
  const sheetMounted = screen.getByLabelText("Sheet mounted");
  // Window shortcuts registered by sidebar children only work while they stay mounted.
  expect(document.querySelector('[data-mobile="true"]')?.textContent).toContain("Sheet contents");
  await expect.element(sheetMounted).toHaveTextContent("false");

  await userEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  await expect.element(sheetMounted).toHaveTextContent("true");

  await userEvent.keyboard("{Escape}");
  await expect.element(sheetMounted).toHaveTextContent("false");
  expect(document.querySelector('[data-mobile="true"]')?.textContent).toContain("Sheet contents");
});
