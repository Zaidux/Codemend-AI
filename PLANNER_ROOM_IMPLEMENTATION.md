# Planner Room Implementation Master Plan

**Created:** December 20, 2025  
**Feature:** AI Planner Room - Expert planning & task delegation system

## 🎯 Feature Overview

A dedicated chat room with an expert planner AI that can:
- Create and manage todo lists
- Read files and create documents
- Delegate tasks to the coding model
- Verify implementations automatically
- Track progress and update task status
- Act as error searcher and debugger

## 📋 Design Decisions (Finalized)

### 1. **Model Selection & Fallback**
- ✅ Use default planner model from settings
- ✅ Fallback to available models if primary is unresponsive
- ✅ Auto-select from user's configured model list

### 2. **Task Delegation & Approval**
- ✅ User must approve delegated tasks (confirmation modal)
- ✅ Show complete plan before execution
- ✅ Allow user to edit/discuss more with planner
- ✅ User controls task deletion

### 3. **Verification Method**
- ✅ **Dual verification:**
  - Regex pattern matching (quick checks)
  - Semantic verification (model reads code and validates)
- ✅ Verify completeness of implementation
- ✅ Check if code matches requirements

### 4. **UI/UX Design**
- ✅ Separate window for planner room
- ✅ Modal for task delegation that redirects to chat
- ✅ View coding model in action in specified/new project
- ✅ Real-time progress tracking

### 5. **Storage & Persistence**
- ✅ Save planner sessions separately from main chat
- ✅ Include knowledge graph for each planner session
- ✅ Link planner session ↔ delegated coding sessions

## 🏗️ Implementation Phases

### **Phase 1: Foundation & Settings** ✅ COMPLETED
**Duration:** ~45 minutes  
**Status:** 🟢 Completed - Dec 20, 2025

**Tasks:**
- [x] Review existing planner config in SettingsModal
- [x] Update planner config for task delegation features
- [x] Add fallback model selector (already exists as activeModelId)
- [x] Update types.ts with planner session types
- [x] Create PlannerSession interface (updated Session type)
- [x] Add DelegatedTask interface
- [x] Add VerificationResult interface
- [x] Add PlannerKnowledge interface
- [x] Updated planner role system prompt with delegation capabilities

**Files Modified:**
- `types.ts` ✅ (Added DelegatedTask, VerificationResult, PlannerKnowledge, updated Session)
- `constants.ts` ✅ (Updated role_architect system prompt)

**Deliverables:**
- ✅ Planner config exists in settings (plannerModelId, plannerRoleId)
- ✅ Session type definitions complete
- ✅ Fallback model logic (using existing activeModelId)
- ✅ Enhanced planner role with delegation instructions

---

### **Phase 2: Planner Room UI** ✅ COMPLETED
**Duration:** ~1 hour  
**Status:** 🟢 Completed - Dec 20, 2025

**Tasks:**
- [x] Create PlannerRoom.tsx component
- [x] Design planner chat interface (separate window/modal)
- [x] Implement session management for planner
- [x] Create planner system prompt (updated in constants.ts)
- [x] Add active tasks panel (right sidebar)
- [x] Add progress tracking UI
- [x] Style planner room with purple/pink gradient theme
- [x] Add empty states for chat and tasks
- [x] Add task status icons and colors
- [x] Add priority indicators

**Files Created:**
- `components/PlannerRoom.tsx` ✅ (340 lines, full UI implementation)

**Deliverables:**
- ✅ Functional planner chat interface
- ✅ Split layout: Chat + Task Panel
- ✅ Task status visualization
- ✅ Beautiful gradient theme
- ✅ Responsive design

**Next Steps:**
- Need to integrate into App.tsx
- Need to add planner button to header
- Need to implement planner-specific message handling

---

### **Phase 3: Planner-Specific Tools** ✅ COMPLETED
**Duration:** ~1.5 hours  
**Status:** 🟢 Completed - Dec 20, 2025

**Tasks:**
- [x] Add `create_todo` tool
- [x] Add `update_todo_status` tool
- [x] Add `create_document` tool (markdown files)
- [x] Add `verify_implementation` tool (regex + semantic)
- [x] Add `delegate_task` tool
- [x] Update llmTools.ts with planner-only flag
- [x] Update llmService.ts to handle planner tools
- [x] Implement tool execution for planner context
- [x] Return metadata from tools for UI processing
- [x] Update App.tsx processToolCalls to handle planner metadata

**Files Modified:**
- `services/llmTools.ts` ✅ (Added 5 planner-only tools)
- `services/llmService.ts` ✅ (Added tool handlers with metadata)
- `App.tsx` ✅ (Updated processToolCalls for planner tools)

**Tool Implementations:**

1. **create_todo** ✅
   - Creates detailed todo items
   - Parameters: title, description, priority, estimatedTime, phase, requirements
   - Returns metadata for UI to add to todo list
   - Auto-generates unique todo IDs

2. **update_todo_status** ✅
   - Updates todo status (pending/in_progress/completed)
   - Parameters: todoId, status, notes, completionPercentage
   - Returns metadata for UI to update todo
   - Tracks completion percentage

3. **create_document** ✅
   - Creates markdown/text documentation files
   - Parameters: path, content, type, title
   - Returns file change for review
   - Types: plan, architecture, api, guide, other

4. **verify_implementation** ✅
   - Dual verification: regex + semantic
   - Parameters: filePath, requirements, verificationLevel, expectedPatterns
   - Returns verification results with completeness percentage
   - Levels: quick (regex only), thorough (regex+semantic), comprehensive (full analysis)
   - Returns metadata with passed/failed counts

5. **delegate_task** ✅
   - Delegates tasks to coding model for implementation
   - Parameters: title, description, requirements, priority, estimatedTime, targetProject, filesToModify, dependencies
   - Creates DelegatedTask with status 'pending_approval'
   - Returns metadata for task approval modal (Phase 4)

**Deliverables:**
- ✅ Planner can create/manage todos
- ✅ Planner can create documentation
- ✅ Planner can verify code implementations
- ✅ Planner can delegate tasks to coder
- ✅ All tools return metadata for UI integration
- ✅ processToolCalls handles planner tool results

---

### **Phase 4: Task Delegation System** ✅ COMPLETED
**Duration:** ~2 hours  
**Status:** 🟢 Complete

**Tasks:**
- [x] Create task approval modal
- [x] Implement plan review UI with complete task breakdown
- [x] Add edit/discuss functionality
- [x] Implement delegated task queue
- [x] Link planner session to coding session
- [x] Auto-create coding session from delegation
- [x] Add redirect to coding chat
- [x] Implement task handoff protocol
- [x] Add approve/edit/cancel workflows

**Files Created:**
- `components/TaskApprovalModal.tsx` (210 lines) - Full-featured approval UI

**Files Modified:**
- `App.tsx` (delegation handlers: handleApproveTask, handleEditTask, handleCancelTask)

**Task Delegation Flow:**
```
1. Planner creates plan with delegate_task tool
2. Show TaskApprovalModal with:
   - Complete task breakdown (title, description, requirements)
   - Priority indicator with color coding
   - Estimated time
   - Files to be created/modified
   - Dependencies & prerequisites
   - [Approve] [Edit Plan] [Cancel] buttons
3. On Approve:
   - Create new session (or use existing project)
   - Link coding session to planner (plannerSessionId)
   - Format task as detailed initial message
   - Add task to coding model's context
   - Update task status: pending_approval → approved → in_progress
   - Redirect user to coding chat (setShowPlannerRoom(false))
   - Auto-send to AI (handleSendMessage)
4. On Edit Plan:
   - Show feedback textarea
   - Return to planner chat (setShowPlannerRoom(true))
   - Add user feedback as message to planner session
   - Remove task from queue
   - Auto-send feedback to planner AI
5. On Cancel:
   - Remove task from delegatedTasks
```

**Implementation Details:**
- TaskApprovalModal.tsx features:
  - Priority color coding (critical=red, high=orange, medium=yellow, low=green)
  - Priority icons with emojis
  - Estimated time display with Clock icon
  - Requirements list with checkmarks
  - Target project display
  - Files to modify list (monospace font)
  - Dependencies list with warning icons
  - Feedback textarea for edit mode
  - Purple/pink gradient header consistent with Planner Room
  - Responsive design with max-height scrolling
  
- handleApproveTask flow:
  - Updates task status to 'approved' with startedAt timestamp
  - Finds or creates target project
  - Creates new coding session with type='delegated'
  - Sets plannerSessionId on coding session
  - Formats initial message with all task details
  - Updates task with codingSessionId and status='in_progress'
  - Switches to coding session view
  - Auto-executes by calling handleSendMessage
  
- handleEditTask flow:
  - Removes task from delegatedTasks (user rejected/wants changes)
  - Switches to planner room view
  - Finds or creates planner session
  - Adds feedback as user message to planner
  - Auto-sends to planner AI for revision
  
- handleCancelTask flow:
  - Simple filter to remove task from queue
  - One-click cancellation

**Deliverables:**
- ✅ Task delegation tool (created in Phase 3)
- ✅ User approval system with TaskApprovalModal
- ✅ Session creation & linking (bidirectional references)
- ✅ Redirect to coding chat with seamless UX
- ✅ Edit flow for iterative planning
- ✅ Auto-execution after approval

---

### **Phase 5: Progress Tracking & Verification** ⏳ Not Started
**Duration:** ~1.5 hours  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Create ProgressTracker.tsx component
- [ ] Monitor coding AI responses
- [ ] Parse completion signals from AI
- [ ] Implement auto-verification triggers
- [ ] Add regex verification logic
- [ ] Add semantic verification (AI reads & validates)
- [ ] Update todo status automatically
- [ ] Create verification reports
- [ ] Add planner notifications
- [ ] Handle verification failures
- [ ] Force coding model to re-check on failure

**Files to Create:**
- `components/ProgressTracker.tsx`
- `services/verificationService.ts`

**Files to Modify:**
- `services/llmService.ts` (intercept coding AI responses)
- `components/PlannerRoom.tsx` (show progress updates)

**Verification Logic:**
```typescript
interface VerificationResult {
  passed: boolean;
  method: 'regex' | 'semantic';
  completeness: number; // 0-100%
  issues: string[];
  recommendations: string[];
}

// Dual verification:
1. Regex Check: Quick pattern matching
   - Function exists
   - Imports present
   - Basic structure correct

2. Semantic Check: AI reads code
   - Understands implementation
   - Matches requirements
   - Checks edge cases
   - Validates completeness
```

**Deliverables:**
- ✅ Real-time progress tracking
- ✅ Auto-verification system
- ✅ Todo status updates
- ✅ Error detection & reporting

---

### **Phase 6: Knowledge Graph & Storage** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Create separate storage for planner sessions
- [ ] Implement planner knowledge graph
- [ ] Link planner ↔ coding sessions
- [ ] Add session metadata
- [ ] Create planner session history
- [ ] Add session search/filter
- [ ] Implement session export
- [ ] Add session templates

**Storage Keys:**
```
- cm_planner_sessions
- cm_planner_knowledge_graph
- cm_delegated_tasks
- cm_verification_history
```

**Files to Modify:**
- `App.tsx` (storage logic)
- `services/contextService.ts` (planner context)

**Deliverables:**
- ✅ Persistent planner sessions
- ✅ Knowledge graph integration
- ✅ Session linking

---

### **Phase 7: Error Detection & Recovery** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Add error detection from AI logs
- [ ] Create error analysis tool
- [ ] Implement auto-retry logic
- [ ] Add error reports for planner
- [ ] Create debugging suggestions
- [ ] Add manual intervention options
- [ ] Implement rollback on critical failures

**Files to Create:**
- `services/errorDetectionService.ts`

**Deliverables:**
- ✅ Automatic error detection
- ✅ Error reporting to planner
- ✅ Recovery mechanisms

---

### **Phase 8: Polish & Testing** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Add keyboard shortcuts
- [ ] Improve animations/transitions
- [ ] Add loading states
- [ ] Create user documentation
- [ ] Add tooltips/help text
- [ ] Test all verification scenarios
- [ ] Test delegation flow
- [ ] Test error recovery
- [ ] Performance optimization
- [ ] Bug fixes

**Deliverables:**
- ✅ Polished UI/UX
- ✅ Complete documentation
- ✅ Tested & stable

---

## 📊 Overall Progress

**Total Phases:** 8  
**Completed:** 4 ✅  
**In Progress:** 0  
**Not Started:** 4  
**Overall:** 50% Complete

**Estimated Total Time:** ~9.5 hours  
**Time Spent:** ~5 hours  
**Time Remaining:** ~4.5 hours

---

## 🔗 Key Integration Points

### Existing Systems to Connect:
1. **Model Switch Service** - Use for fallback models
2. **Todo List** - Already integrated, extend for planner
3. **LLM Tools** - Add planner-only tools
4. **Session Management** - Create planner session type
5. **Context Service** - Add planner context handling
6. **Knowledge Base** - Create planner knowledge graph

### New Services to Create:
1. **DelegationService** - Handle task delegation
2. **VerificationService** - Code verification logic
3. **ErrorDetectionService** - Error analysis
4. **PlannerLLMService** - Specialized planner AI handling

---

## 📝 Notes & Considerations

### Technical Decisions:
- Use existing tool infrastructure (llmTools.ts)
- Extend session types instead of creating new system
- Reuse TodoList component with enhanced features
- Leverage existing file reading tools
- Build on top of current LLM service

### User Experience:
- Clear visual separation (planner vs coding)
- Confirmation required for all delegations
- Real-time progress visibility
- Easy to return to planner from coding chat
- Transparent verification process

### Future Enhancements:
- Multi-project planning
- Planner templates (common patterns)
- Team collaboration features
- Cost tracking for delegated tasks
- Performance analytics

---

## 🚀 Next Steps

1. **Review existing planner config** in SettingsModal
2. **Start Phase 1** - Foundation & Settings
3. **Iterate phase by phase** as approved
4. **Track progress** in this document

---

**Last Updated:** December 20, 2025  
**Current Phase:** Phase 4 Complete - Ready for Phase 5 (Progress Tracking & Verification)

---

## 📦 Recent Updates

### Phase 4 Complete - Task Delegation System
- TaskApprovalModal.tsx created (210 lines) with full approval workflow
- Three-button system: [Approve] [Edit Plan] [Cancel]
- All delegation flows implemented:
  - **Approve:** Creates coding session, links to planner, auto-executes
  - **Edit:** Returns to planner with user feedback for revision
  - **Cancel:** Removes task from queue
- Planner can now:
  - Create and delegate tasks to coding model
  - User reviews complete task breakdown before execution
  - User can request plan changes without manual messaging
  - Seamless transition between planner and coding views
  - Full task context preserved in coding session

### Build Status
- ✅ Successful (49.98s, 904.25 KB main bundle)
- All TypeScript compilation successful
- No runtime errors

### Next: Phase 5 - Progress Tracking & Verification
- Monitor coding session progress automatically
- Trigger verification after task completion
- Update delegated task status based on results
- Notify planner of verification outcomes
- Handle verification failures with retry logic


### Phase 1 - Foundation ✅
- Updated Session interface with planner support
- Created DelegatedTask, VerificationResult, PlannerKnowledge types
- Enhanced planner role system prompt
- Verified existing planner config in settings

### Phase 2 - Planner Room UI ✅
- Created full PlannerRoom component (340 lines)
- Split layout: Chat area + Task panel
- Task status visualization with icons/colors
- Priority indicators
- Empty states
- Purple/pink gradient theme
- Responsive design

### Phase 3 - Planner-Specific Tools ✅
- Implemented 5 planner-only tools in llmTools.ts
- Tool handlers in llmService.ts with metadata returns
- create_todo: Creates detailed todo items with requirements
- update_todo_status: Updates todo status with completion tracking
- create_document: Creates markdown documentation files
- verify_implementation: Dual verification (regex + semantic) with completeness %
- delegate_task: Delegates tasks to coder with approval flow
- Updated App.tsx processToolCalls to handle planner tool metadata
- Todos automatically added to project task list
- Delegated tasks added to delegatedTasks state

### Phase 4 - Task Delegation System ✅
- TaskApprovalModal.tsx component (210 lines):
  - Complete task breakdown with all details
  - Priority color coding (critical/high/medium/low)
  - Files to modify list
  - Dependencies display
  - Feedback textarea for edit mode
  - Purple/pink gradient theme
- handleApproveTask() flow:
  - Creates/finds target project
  - Creates new coding session with type='delegated'
  - Links sessions bidirectionally (plannerSessionId ↔ codingSessionId)
  - Formats task as detailed initial message
  - Updates task status: pending_approval → approved → in_progress
  - Redirects to coding chat
  - Auto-executes task
- handleEditTask() flow:
  - Returns to planner room
  - Adds user feedback to planner session
  - Removes task from queue
  - Auto-sends feedback to planner AI
- handleCancelTask() flow:
  - Simple task removal from queue

### Integration Complete ✅
- **App.tsx Integration:**
  - Added planner sessions state with localStorage persistence
  - Added delegated tasks state with localStorage persistence
  - Added planner knowledge state with localStorage persistence
  - Created handlePlannerMessage() for planner AI responses
  - Created updatePlannerSession() for session management
  - Created generatePlannerSessionTitle() for auto-titles
  - Created handleDelegateTask() for task delegation (Phase 3)
  - Created handleApproveTask() for task approval (Phase 4)
  - Created handleEditTask() for plan revision (Phase 4)
  - Created handleCancelTask() for task cancellation (Phase 4)
  - Integrated PlannerRoom component in render tree
  - Integrated TaskApprovalModal component in render tree
  
- **Header.tsx Integration:**
  - Added Brain icon button for Planner Room
  - Purple hover effect to distinguish from other buttons
  - Tooltip: "Planner Room - Expert Planning & Task Delegation"
  
- **Storage Keys Added:**
  - `cm_planner_sessions` - Planner chat sessions
  - `cm_delegated_tasks` - Tasks delegated to coder
  - `cm_planner_knowledge` - Planner knowledge graph

- **Build Status:** ✅ Successful (49.98s, 904.25 KB main bundle)
