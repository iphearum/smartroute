# Worked Example — Fat Controller → Layered Use Case

## Before (everything in one method)

```php
class StudentController
{
    public function create(Request $request)
    {
        // validation
        // business rules
        // raw SQL
        // notification
        // response shaping
    }
}
```

Problems: untestable without HTTP, business rules invisible to the domain, storage engine
welded to the controller, notification failure breaks the request.

## After

`app/Modules/Student/Domain/Student.php` — business behavior and invariants
`app/Modules/Student/Domain/StudentRepository.php` — the persistence contract
`app/Modules/Student/Application/CreateStudent.php` — the workflow
`app/Modules/Student/Infrastructure/EloquentStudentRepository.php` — the implementation
`app/Modules/Student/Http/StudentController.php` — HTTP only

```php
final class CreateStudent
{
    public function __construct(
        private StudentRepository $students,
        private EventDispatcher $events,
    ) {}

    public function execute(CreateStudentData $data): Student
    {
        $student = Student::create($data->name, $data->email);

        $this->students->save($student);
        $this->events->dispatch(new StudentCreated($student->id));

        return $student;
    }
}
```

```php
final class StudentController
{
    public function store(StoreStudentRequest $request, CreateStudent $createStudent)
    {
        return StudentResource::make(
            $createStudent->execute(CreateStudentData::from($request->validated()))
        );
    }
}
```

## Why each piece exists

```
Controller     HTTP only — parse in, format out
Use case       application workflow and transaction boundary
Entity         business behavior and invariants
Repository     persistence contract, storage-agnostic
Infrastructure the concrete database implementation
Event          side effects decoupled from the write path
```

## What this buys

- `CreateStudent` is unit-testable with an in-memory repository — no DB, no HTTP.
- Notification failure no longer has to fail the write.
- Swapping Eloquent for something else touches one file.

## What it does NOT buy

Nothing, if the app is a five-table CRUD admin panel. Apply this when the module has real
business rules worth protecting — otherwise the indirection is pure cost.

## Migration order for an existing app

```
1. Extract the use case, controller calls it (behavior unchanged)
2. Introduce the repository interface, keep the current query code behind it
3. Move invariants into the entity
4. Move side effects to events
5. Repeat per feature — never all modules at once
```
