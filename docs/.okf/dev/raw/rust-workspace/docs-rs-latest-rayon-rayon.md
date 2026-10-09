[Docs.rs](https://docs.rs/)

- [rayon-1.12.0](https://docs.rs/rayon/latest/rayon/# "Simple work-stealing parallelism for Rust")


  - rayon 1.12.0

  - [Permalink](https://docs.rs/rayon/1.12.0/rayon/ "Get a link to this specific version")
  - [Docs.rs crate page](https://docs.rs/crate/rayon/latest "See rayon in docs.rs")
  - [MIT](https://spdx.org/licenses/MIT) OR [Apache-2.0](https://spdx.org/licenses/Apache-2.0)
  - 22 September 2026


  - Links
  - [Repository](https://github.com/rayon-rs/rayon)
  - [crates.io](https://crates.io/crates/rayon "See rayon in crates.io")
  - [Source](https://docs.rs/crate/rayon/latest/source/ "Browse source of rayon-1.12.0")

  - Owners
  - [nikomatsakis](https://crates.io/users/nikomatsakis)
  - [cuviper](https://crates.io/users/cuviper)

  - Dependencies
  - - [either ^1\\
           \\
           _normal_](https://docs.rs/either/%5E1/)
    - [rayon-core ^1.13.0\\
       \\
       _normal_](https://docs.rs/rayon-core/%5E1.13.0/)
    - [wasm\_sync ^0.1.0\\
       \\
       _normal_ _optional_](https://docs.rs/wasm_sync/%5E0.1.0/)
    - [rand ^0.9\\
       \\
       _dev_](https://docs.rs/rand/%5E0.9/)
    - [rand\_xorshift ^0.4\\
       \\
       _dev_](https://docs.rs/rand_xorshift/%5E0.4/)

  - Versions

  - [**100%**\\
     of the crate is documented](https://docs.rs/crate/rayon/latest)

- [Platform](https://docs.rs/rayon/latest/rayon/#)  - [x86\_64-unknown-linux-gnu](https://docs.rs/crate/rayon/latest/target-redirect/rayon/)
- [Feature flags](https://docs.rs/crate/rayon/latest/features "Browse available feature flags of rayon-1.12.0")

- [docs.rs](https://docs.rs/rayon/latest/rayon/#)  - [About docs.rs](https://docs.rs/about)
  - [Badges](https://docs.rs/about/badges)
  - [Builds](https://docs.rs/about/builds)
  - [Metadata](https://docs.rs/about/metadata)
  - [Shorthand URLs](https://docs.rs/about/redirections)
  - [Download](https://docs.rs/about/download)
  - [Rustdoc JSON](https://docs.rs/about/rustdoc-json)
  - [Build queue](https://docs.rs/releases/queue)
  - [Privacy policy](https://foundation.rust-lang.org/policies/privacy-policy/#docs.rs)

- [Rust](https://docs.rs/rayon/latest/rayon/#)  - [Rust website](https://www.rust-lang.org/)
  - [The Book](https://doc.rust-lang.org/book/)
  - [Standard Library API Reference](https://doc.rust-lang.org/std/)
  - [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
  - [The Cargo Guide](https://doc.rust-lang.org/cargo/guide/)
  - [Clippy Documentation](https://doc.rust-lang.org/nightly/clippy)

[Skip to main content](https://docs.rs/rayon/latest/rayon/#main-content)

[Settings](https://docs.rs/rayon/latest/settings.html)

[Help](https://docs.rs/rayon/latest/help.html)

## [Crate rayon](https://docs.rs/rayon/latest/rayon/\#)

[show sidebar](https://docs.rs/rayon/latest/rayon/all.html "show sidebar")

# Crate rayonCopy item path

[Search](https://docs.rs/rayon/latest/rayon/?search=)

[Settings](https://docs.rs/rayon/latest/settings.html)

[Help](https://docs.rs/rayon/latest/help.html)

Summary[Source](https://docs.rs/rayon/latest/src/rayon/lib.rs.html#1-156)

Expand description

Rayon is a data-parallelism library that makes it easy to convert sequential
computations into parallel.

It is lightweight and convenient for introducing parallelism into existing
code. It guarantees data-race free executions and takes advantage of
parallelism when sensible, based on work-load at runtime.

## [§](https://docs.rs/rayon/latest/rayon/\#how-to-use-rayon) How to use Rayon

There are two ways to use Rayon:

- **High-level parallel constructs**are the simplest way to use Rayon and also
typically the most efficient.

  - [Parallel iterators](https://docs.rs/rayon/latest/rayon/iter/index.html "mod rayon::iter")make it easy to convert a sequential iterator to
    execute in parallel.

    - The [`ParallelIterator`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html "trait rayon::iter::ParallelIterator") trait defines general methods for all parallel iterators.
    - The [`IndexedParallelIterator`](https://docs.rs/rayon/latest/rayon/iter/trait.IndexedParallelIterator.html "trait rayon::iter::IndexedParallelIterator") trait adds methods for iterators that support random
      access.
  - The [`par_sort`](https://docs.rs/rayon/latest/rayon/slice/trait.ParallelSliceMut.html#method.par_sort "method rayon::slice::ParallelSliceMut::par_sort") method sorts `&mut [T]` slices (or vectors) in parallel.
  - [`par_extend`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelExtend.html#tymethod.par_extend "method rayon::iter::ParallelExtend::par_extend") can be used to efficiently grow collections with items produced
    by a parallel iterator.
- **Custom tasks**let you divide your work into parallel tasks yourself.

  - [`join`](https://docs.rs/rayon/latest/rayon/fn.join.html "fn rayon::join") is used to subdivide a task into two pieces.
  - [`scope`](https://docs.rs/rayon/latest/rayon/fn.scope.html "fn rayon::scope") creates a scope within which you can create any number of parallel tasks.
  - [`ThreadPoolBuilder`](https://docs.rs/rayon/latest/rayon/struct.ThreadPoolBuilder.html "struct rayon::ThreadPoolBuilder") can be used to create your own thread pools or customize
    the global one.

## [§](https://docs.rs/rayon/latest/rayon/\#basic-usage-and-the-rayon-prelude) Basic usage and the Rayon prelude

First, you will need to add `rayon` to your `Cargo.toml`.

Next, to use parallel iterators or the other high-level methods,
you need to import several traits. Those traits are bundled into
the module [`rayon::prelude`](https://docs.rs/rayon/latest/rayon/prelude/index.html "mod rayon::prelude"). It is recommended that you import
all of these traits at once by adding `use rayon::prelude::*` at
the top of each module that uses Rayon methods.

These traits give you access to the `par_iter` method which provides
parallel implementations of many iterative functions such as [`map`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html#method.map "method rayon::iter::ParallelIterator::map"),
[`for_each`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html#method.for_each "method rayon::iter::ParallelIterator::for_each"), [`filter`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html#method.filter "method rayon::iter::ParallelIterator::filter"), [`fold`](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html#method.fold "method rayon::iter::ParallelIterator::fold"), and [more](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html#provided-methods "trait rayon::iter::ParallelIterator").

## [§](https://docs.rs/rayon/latest/rayon/\#crate-layout) Crate Layout

Rayon extends many of the types found in the standard library with
parallel iterator implementations. The modules in the `rayon`
crate mirror [`std`](https://doc.rust-lang.org/nightly/std/index.html "mod std") itself: so, e.g., the `option` module in
Rayon contains parallel iterators for the `Option` type, which is
found in [the `option` module of `std`](https://doc.rust-lang.org/nightly/core/option/index.html "mod core::option"). Similarly, the
`collections` module in Rayon offers parallel iterator types for
[the `collections` from `std`](https://doc.rust-lang.org/nightly/std/collections/index.html "mod std::collections"). You will rarely need to access
these submodules unless you need to name iterator types
explicitly.

## [§](https://docs.rs/rayon/latest/rayon/\#targets-without-threading) Targets without threading

Rayon has limited support for targets without `std` threading implementations.
See the [`rayon_core`](https://docs.rs/rayon-core/1.13.0/x86_64-unknown-linux-gnu/rayon_core/index.html "mod rayon_core") documentation for more information about its global fallback.

## [§](https://docs.rs/rayon/latest/rayon/\#other-questions) Other questions?

See [the Rayon FAQ](https://github.com/rayon-rs/rayon/blob/main/FAQ.md).

## Modules [§](https://docs.rs/rayon/latest/rayon/\#modules)

[array](https://docs.rs/rayon/latest/rayon/array/index.html "mod rayon::array")Parallel iterator types for [arrays](https://doc.rust-lang.org/nightly/std/primitive.array.html "primitive array") (`[T; N]`)[collections](https://docs.rs/rayon/latest/rayon/collections/index.html "mod rayon::collections")Parallel iterator types for [standard collections](https://doc.rust-lang.org/nightly/std/collections/index.html "mod std::collections")[iter](https://docs.rs/rayon/latest/rayon/iter/index.html "mod rayon::iter")Traits for writing parallel programs using an iterator-style interface[option](https://docs.rs/rayon/latest/rayon/option/index.html "mod rayon::option")Parallel iterator types for [options](https://doc.rust-lang.org/nightly/core/option/index.html "mod core::option")[prelude](https://docs.rs/rayon/latest/rayon/prelude/index.html "mod rayon::prelude")The rayon prelude imports the various `ParallelIterator` traits.
The intention is that one can include `use rayon::prelude::*` and
have easy access to the various traits and methods you will need.[range](https://docs.rs/rayon/latest/rayon/range/index.html "mod rayon::range")Parallel iterator types for [ranges](https://doc.rust-lang.org/nightly/core/ops/range/struct.Range.html "struct core::ops::range::Range"),
the type for values created by `a..b` expressions[range\_inclusive](https://docs.rs/rayon/latest/rayon/range_inclusive/index.html "mod rayon::range_inclusive")Parallel iterator types for [inclusive ranges](https://doc.rust-lang.org/nightly/core/ops/range/struct.RangeInclusive.html "struct core::ops::range::RangeInclusive"),
the type for values created by `a..=b` expressions[result](https://docs.rs/rayon/latest/rayon/result/index.html "mod rayon::result")Parallel iterator types for [results](https://doc.rust-lang.org/nightly/core/result/index.html "mod core::result")[slice](https://docs.rs/rayon/latest/rayon/slice/index.html "mod rayon::slice")Parallel iterator types for [slices](https://doc.rust-lang.org/nightly/alloc/slice/index.html "mod alloc::slice")[str](https://docs.rs/rayon/latest/rayon/str/index.html "mod rayon::str")Parallel iterator types for [strings](https://doc.rust-lang.org/nightly/alloc/str/index.html "mod alloc::str")[string](https://docs.rs/rayon/latest/rayon/string/index.html "mod rayon::string")This module contains the parallel iterator types for owned strings
(`String`). You will rarely need to interact with it directly
unless you have need to name one of the iterator types.[vec](https://docs.rs/rayon/latest/rayon/vec/index.html "mod rayon::vec")Parallel iterator types for [vectors](https://doc.rust-lang.org/nightly/alloc/vec/index.html "mod alloc::vec") (`Vec<T>`)

## Structs [§](https://docs.rs/rayon/latest/rayon/\#structs)

[BroadcastContext](https://docs.rs/rayon/latest/rayon/struct.BroadcastContext.html "struct rayon::BroadcastContext")Provides context to a closure called by `broadcast`.[FnContext](https://docs.rs/rayon/latest/rayon/struct.FnContext.html "struct rayon::FnContext")Provides the calling context to a closure called by `join_context`.[Scope](https://docs.rs/rayon/latest/rayon/struct.Scope.html "struct rayon::Scope")Represents a fork-join scope which can be used to spawn any number of tasks.
See [`scope()`](https://docs.rs/rayon/latest/rayon/fn.scope.html "fn rayon::scope") for more information.[ScopeFifo](https://docs.rs/rayon/latest/rayon/struct.ScopeFifo.html "struct rayon::ScopeFifo")Represents a fork-join scope which can be used to spawn any number of tasks.
Those spawned from the same thread are prioritized in relative FIFO order.
See [`scope_fifo()`](https://docs.rs/rayon/latest/rayon/fn.scope_fifo.html "fn rayon::scope_fifo") for more information.[ThreadBuilder](https://docs.rs/rayon/latest/rayon/struct.ThreadBuilder.html "struct rayon::ThreadBuilder")Thread builder used for customization via [`ThreadPoolBuilder::spawn_handler()`](https://docs.rs/rayon/latest/rayon/struct.ThreadPoolBuilder.html#method.spawn_handler "method rayon::ThreadPoolBuilder::spawn_handler").[ThreadPool](https://docs.rs/rayon/latest/rayon/struct.ThreadPool.html "struct rayon::ThreadPool")Represents a user-created [thread pool](https://en.wikipedia.org/wiki/Thread_pool).[ThreadPoolBuildError](https://docs.rs/rayon/latest/rayon/struct.ThreadPoolBuildError.html "struct rayon::ThreadPoolBuildError")Error when initializing a thread pool.[ThreadPoolBuilder](https://docs.rs/rayon/latest/rayon/struct.ThreadPoolBuilder.html "struct rayon::ThreadPoolBuilder")Used to create a new [`ThreadPool`](https://docs.rs/rayon/latest/rayon/struct.ThreadPool.html "struct rayon::ThreadPool") or to configure the global rayon thread pool.

## Enums [§](https://docs.rs/rayon/latest/rayon/\#enums)

[Yield](https://docs.rs/rayon/latest/rayon/enum.Yield.html "enum rayon::Yield")Result of [`yield_now()`](https://docs.rs/rayon/latest/rayon/fn.yield_now.html "fn rayon::yield_now") or [`yield_local()`](https://docs.rs/rayon/latest/rayon/fn.yield_local.html "fn rayon::yield_local").

## Functions [§](https://docs.rs/rayon/latest/rayon/\#functions)

[broadcast](https://docs.rs/rayon/latest/rayon/fn.broadcast.html "fn rayon::broadcast")Executes `op` within every thread in the current thread pool. If this is
called from a non-Rayon thread, it will execute in the global thread pool.
Any attempts to use `join`, `scope`, or parallel iterators will then operate
within that thread pool. When the call has completed on each thread, returns
a vector containing all of their return values.[current\_num\_threads](https://docs.rs/rayon/latest/rayon/fn.current_num_threads.html "fn rayon::current_num_threads")Returns the number of threads in the current registry. If this
code is executing within a Rayon thread pool, then this will be
the number of threads for the thread pool of the current
thread. Otherwise, it will be the number of threads for the global
thread pool.[current\_thread\_index](https://docs.rs/rayon/latest/rayon/fn.current_thread_index.html "fn rayon::current_thread_index")If called from a Rayon worker thread, returns the index of that
thread within its current pool; if not called from a Rayon thread,
returns `None`.[in\_place\_scope](https://docs.rs/rayon/latest/rayon/fn.in_place_scope.html "fn rayon::in_place_scope")Creates a “fork-join” scope `s` and invokes the closure with a
reference to `s`. This closure can then spawn asynchronous tasks
into `s`. Those tasks may run asynchronously with respect to the
closure; they may themselves spawn additional tasks into `s`. When
the closure returns, it will block until all tasks that have been
spawned into `s` complete.[in\_place\_scope\_fifo](https://docs.rs/rayon/latest/rayon/fn.in_place_scope_fifo.html "fn rayon::in_place_scope_fifo")Creates a “fork-join” scope `s` with FIFO order, and invokes the
closure with a reference to `s`. This closure can then spawn
asynchronous tasks into `s`. Those tasks may run asynchronously with
respect to the closure; they may themselves spawn additional tasks
into `s`. When the closure returns, it will block until all tasks
that have been spawned into `s` complete.[join](https://docs.rs/rayon/latest/rayon/fn.join.html "fn rayon::join")Takes two closures and _potentially_ runs them in parallel. It
returns a pair of the results from those closures.[join\_context](https://docs.rs/rayon/latest/rayon/fn.join_context.html "fn rayon::join_context")Identical to `join`, except that the closures have a parameter
that provides context for the way the closure has been called,
especially indicating whether they’re executing on a different
thread than where `join_context` was called. This will occur if
the second job is stolen by a different thread, or if
`join_context` was called from outside the thread pool to begin
with.[max\_num\_threads](https://docs.rs/rayon/latest/rayon/fn.max_num_threads.html "fn rayon::max_num_threads")Returns the maximum number of threads that Rayon supports in a single thread pool.[scope](https://docs.rs/rayon/latest/rayon/fn.scope.html "fn rayon::scope")Creates a “fork-join” scope `s` and invokes the closure with a
reference to `s`. This closure can then spawn asynchronous tasks
into `s`. Those tasks may run asynchronously with respect to the
closure; they may themselves spawn additional tasks into `s`. When
the closure returns, it will block until all tasks that have been
spawned into `s` complete.[scope\_fifo](https://docs.rs/rayon/latest/rayon/fn.scope_fifo.html "fn rayon::scope_fifo")Creates a “fork-join” scope `s` with FIFO order, and invokes the
closure with a reference to `s`. This closure can then spawn
asynchronous tasks into `s`. Those tasks may run asynchronously with
respect to the closure; they may themselves spawn additional tasks
into `s`. When the closure returns, it will block until all tasks
that have been spawned into `s` complete.[spawn](https://docs.rs/rayon/latest/rayon/fn.spawn.html "fn rayon::spawn")Puts the task into the Rayon thread pool’s job queue in the “static”
or “global” scope. Just like a standard thread, this task is not
tied to the current stack frame, and hence it cannot hold any
references other than those with `'static` lifetime. If you want
to spawn a task that references stack data, use [the `scope()`\\
function](https://docs.rs/rayon/latest/rayon/fn.scope.html "fn rayon::scope") to create a scope.[spawn\_broadcast](https://docs.rs/rayon/latest/rayon/fn.spawn_broadcast.html "fn rayon::spawn_broadcast")Spawns an asynchronous task on every thread in this thread pool. This task
will run in the implicit, global scope, which means that it may outlast the
current stack frame – therefore, it cannot capture any references onto the
stack (you will likely need a `move` closure).[spawn\_fifo](https://docs.rs/rayon/latest/rayon/fn.spawn_fifo.html "fn rayon::spawn_fifo")Fires off a task into the Rayon thread pool in the “static” or
“global” scope. Just like a standard thread, this task is not
tied to the current stack frame, and hence it cannot hold any
references other than those with `'static` lifetime. If you want
to spawn a task that references stack data, use [the `scope_fifo()`\\
function](https://docs.rs/rayon/latest/rayon/fn.scope_fifo.html "fn rayon::scope_fifo") to create a scope.[yield\_local](https://docs.rs/rayon/latest/rayon/fn.yield_local.html "fn rayon::yield_local")Cooperatively yields execution to local Rayon work.[yield\_now](https://docs.rs/rayon/latest/rayon/fn.yield_now.html "fn rayon::yield_now")Cooperatively yields execution to Rayon.